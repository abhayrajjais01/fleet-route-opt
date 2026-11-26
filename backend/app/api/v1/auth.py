from datetime import datetime, timezone
from typing import Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.security import (
    hash_password,
    verify_password,
    get_current_user,
    get_optional_user,
    get_signed_in_user,
    issue_token,
)
from app.models.audit import AuditAction
from app.models.user import User, UserRole
from app.schemas.auth import (
    UserCreate,
    UserResponse,
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    Message,
    Token,
)
from app.services.audit_service import record_audit_event

router = APIRouter(tags=["Authentication & RBAC"])
SELF_SERVICE_ROLE = UserRole.DRIVER


@router.post(
    "/register",
    response_model=Token,
    status_code=status.HTTP_201_CREATED,
    summary="Register New User",
    description="Registers a new user account with hashed password and returns an access token.",
)
def register(user_in: UserCreate, db: Session = Depends(get_db), caller: Optional[User] = Depends(get_optional_user)) -> Any:
    # Check if email is already taken
    existing_user = db.query(User).filter(User.email == user_in.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email already exists."
        )

    # First user registered in the system automatically gets ADMIN role (bootstrap). After that, self-registration
    # is open only for the lowest-privilege role; any other role must be assigned by a signed-in admin
    # (Week 14 security audit: anyone could previously register themselves as ADMIN).
    user_count = db.query(User).count()
    if user_count == 0:
        assigned_role = UserRole.ADMIN
    elif user_in.role == SELF_SERVICE_ROLE or (caller is not None and caller.role == UserRole.ADMIN):
        assigned_role = user_in.role
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Only an administrator can create {user_in.role.value} accounts. Ask an admin, or register as {SELF_SERVICE_ROLE.value}.",
        )

    new_user = User(
        email=user_in.email,
        hashed_password=hash_password(user_in.password),
        full_name=user_in.full_name,
        role=assigned_role,
        is_active=user_in.is_active,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # Create access token
    access_token = issue_token(new_user)

    return Token(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse.model_validate(new_user),
    )


@router.post(
    "/login",
    response_model=Token,
    summary="User Login",
    description="Authenticates with email and password and returns a signed JWT access token.",
)
def login(credentials: LoginRequest, db: Session = Depends(get_db)) -> Any:
    user = db.query(User).filter(User.email == credentials.email).first()
    if not user or not verify_password(credentials.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive"
        )

    access_token = issue_token(user)

    return Token(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse.model_validate(user),
    )


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Current User Profile",
    description="Returns the profile and role privileges of the currently authenticated user.",
)
def get_me(current_user: User = Depends(get_signed_in_user)) -> Any:
    return current_user


@router.post(
    "/refresh",
    response_model=Token,
    summary="Refresh Access Token",
    description="Issues a renewed access token for the active session.",
)
def refresh_token(current_user: User = Depends(get_current_user)) -> Any:
    access_token = issue_token(current_user)
    return Token(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse.model_validate(current_user),
    )


@router.post(
    "/change-password",
    response_model=Token,
    summary="Change Your Password",
    description="Needs the current password. Ends every other session and returns a fresh token for this one.",
)
def change_password(body: ChangePasswordRequest, db: Session = Depends(get_db), user: User = Depends(get_signed_in_user)) -> Any:
    # 400, not 401: the session itself is fine, and clients treat 401 as "signed out".
    if not verify_password(body.current_password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Your current password is not correct.")
    if body.new_password == body.current_password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Choose a password you are not already using.")
    if body.new_password.strip().lower() == user.email.lower():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Your password cannot be your email address.")
    user.hashed_password = hash_password(body.new_password)
    user.must_change_password = False
    user.reset_requested_at = None
    user.token_version = (user.token_version or 0) + 1
    record_audit_event(db, user, AuditAction.ASSET_UPDATED, "User", user.id, f"{user.email} changed their password",
                       {"password": "previous"}, {"password": "changed by the account holder"})
    db.commit()
    db.refresh(user)
    return Token(access_token=issue_token(user), user=UserResponse.model_validate(user))


@router.post(
    "/forgot-password",
    response_model=Message,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Ask for a Password Reset",
    description="Flags the account for an administrator, who issues a temporary password from the Users page. The answer "
                "is the same whether or not the account exists, so it cannot be used to discover accounts.",
)
def forgot_password(body: ForgotPasswordRequest, db: Session = Depends(get_db)) -> Any:
    user = db.query(User).filter(User.email == body.email).first()
    if user and user.is_active and user.reset_requested_at is None:
        user.reset_requested_at = datetime.now(timezone.utc)
        record_audit_event(db, user, AuditAction.ASSET_UPDATED, "User", user.id, f"Password reset requested for {user.email}",
                           {"reset_requested": False}, {"reset_requested": True})
        db.commit()
    return Message(message="If that account exists, your administrator has been asked to reset its password.")


@router.post(
    "/seed-demo-users",
    summary="Seed Demo Roles for Testing",
    description="Pre-populates demo accounts (Admin, Dispatcher, Driver) for quick role switching and testing.",
)
def seed_demo_users(db: Session = Depends(get_db)) -> Any:
    if not settings.demo_accounts_enabled:
        # Week 14: these accounts have a published password; never create them on a production deployment.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    demo_accounts = [
        {"email": "admin@fleetopt.io", "password": "password123", "full_name": "Chief Administrator", "role": UserRole.ADMIN},
        {"email": "dispatcher@fleetopt.io", "password": "password123", "full_name": "Central Dispatcher", "role": UserRole.DISPATCHER},
        {"email": "driver@fleetopt.io", "password": "password123", "full_name": "Fleet Driver", "role": UserRole.DRIVER},
        {"email": "manager@fleetopt.io", "password": "password123", "full_name": "Fleet Operations Manager", "role": UserRole.FLEET_MANAGER},
    ]

    created = []
    for acc in demo_accounts:
        user = db.query(User).filter(User.email == acc["email"]).first()
        if not user:
            user = User(
                email=acc["email"],
                hashed_password=hash_password(acc["password"]),
                full_name=acc["full_name"],
                role=acc["role"],
                is_active=True
            )
            db.add(user)
            created.append(acc["email"])
    db.commit()

    return {"status": "success", "seeded_users": created}

from datetime import timedelta
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
)
from app.models.user import User, UserRole
from app.schemas.auth import (
    UserCreate,
    UserResponse,
    LoginRequest,
    Token,
)

router = APIRouter(tags=["Authentication & RBAC"])


@router.post(
    "/register",
    response_model=Token,
    status_code=status.HTTP_201_CREATED,
    summary="Register New User",
    description="Registers a new user account with hashed password and returns an access token.",
)
def register(user_in: UserCreate, db: Session = Depends(get_db)) -> Any:
    # Check if email is already taken
    existing_user = db.query(User).filter(User.email == user_in.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email already exists."
        )

    # First user registered in the system automatically gets ADMIN role
    user_count = db.query(User).count()
    assigned_role = UserRole.ADMIN if user_count == 0 else user_in.role

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
    access_token = create_access_token(
        data={"sub": new_user.email, "role": new_user.role.value}
    )

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

    access_token = create_access_token(
        data={"sub": user.email, "role": user.role.value}
    )

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
def get_me(current_user: User = Depends(get_current_user)) -> Any:
    return current_user


@router.post(
    "/refresh",
    response_model=Token,
    summary="Refresh Access Token",
    description="Issues a renewed access token for the active session.",
)
def refresh_token(current_user: User = Depends(get_current_user)) -> Any:
    access_token = create_access_token(
        data={"sub": current_user.email, "role": current_user.role.value}
    )
    return Token(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse.model_validate(current_user),
    )


@router.post(
    "/seed-demo-users",
    summary="Seed Demo Roles for Testing",
    description="Pre-populates demo accounts (Admin, Dispatcher, Driver) for quick role switching and testing.",
)
def seed_demo_users(db: Session = Depends(get_db)) -> Any:
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

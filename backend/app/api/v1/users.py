"""
users.py - Admin User Management with Linked Driver Profiles (Nov 2026)

Endpoints (ADMIN only):
- GET   /users                     every account, with its linked driver profile (or `profile_missing` for drivers)
- POST  /users                     create an account; a DRIVER account is created together with its driver profile
                                   (or linked to an existing profile) in one transaction
- PATCH /users/{id}                rename, change role, activate / deactivate
- POST  /users/{id}/reset-password issue a temporary password (shown once; ends the account's sessions)
- PUT   /users/{id}/driver         link or unlink a driver profile
- GET   /users/unlinked-drivers    driver profiles that have no login yet (people who cannot use the driver app)

Rules: one profile per account and one account per profile; an admin cannot deactivate or demote themselves,
and the last active admin can never be removed. Accounts are deactivated, never deleted, so the audit trail
keeps every actor. Every change is written to the audit log.
"""

import secrets
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import hash_password, require_roles
from app.models.audit import AuditAction
from app.models.fleet import Driver, Hub
from app.models.user import User, UserRole
from app.schemas.fleet import DriverResponse
from app.schemas.users import DriverLinkRequest, LinkedDriver, ManagedUserCreate, ManagedUserResponse, ManagedUserUpdate, TemporaryPassword
from app.services.audit_service import record_audit_event

router = APIRouter(tags=["User Management"])
admin_only = require_roles([UserRole.ADMIN])


def _profile(db: Session, user: User) -> Optional[Driver]:
    return db.query(Driver).filter(Driver.user_id == user.id).first()


def _response(db: Session, user: User) -> ManagedUserResponse:
    d = _profile(db, user)
    linked = LinkedDriver(id=d.id, full_name=d.full_name, assigned_hub_id=d.assigned_hub_id, status=d.status) if d else None
    return ManagedUserResponse.model_validate(user).model_copy(
        update={"driver": linked, "reset_requested": user.reset_requested_at is not None, "profile_missing": user.role == UserRole.DRIVER and d is None})


def _get_user(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


def _free_profile(db: Session, driver_id: int, for_user: Optional[User] = None) -> Driver:
    d = db.get(Driver, driver_id)
    if not d:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Driver profile not found")
    if d.user_id is not None and (for_user is None or d.user_id != for_user.id):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"{d.full_name}'s profile is already linked to another account")
    return d


def _active_admins(db: Session) -> int:
    return db.query(User).filter(User.role == UserRole.ADMIN, User.is_active.is_(True)).count()


@router.get("", response_model=List[ManagedUserResponse], summary="List accounts with their driver profiles")
def list_users(db: Session = Depends(get_db), _: User = Depends(admin_only)):
    return [_response(db, u) for u in db.query(User).order_by(User.id).all()]


@router.get("/unlinked-drivers", response_model=List[DriverResponse], summary="Driver profiles without a login")
def unlinked_drivers(db: Session = Depends(get_db), _: User = Depends(admin_only)):
    return db.query(Driver).filter(Driver.user_id.is_(None)).order_by(Driver.full_name).all()


@router.post("", response_model=ManagedUserResponse, status_code=status.HTTP_201_CREATED, summary="Create an account")
def create_user(body: ManagedUserCreate, db: Session = Depends(get_db), admin: User = Depends(admin_only)):
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="An account with this email already exists")
    if body.driver and not db.get(Hub, body.driver.assigned_hub_id):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Assigned hub does not exist")
    if body.driver and db.query(Driver).filter(Driver.license_number == body.driver.license_number).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A driver with this licence number already exists")
    existing = _free_profile(db, body.driver_id) if body.driver_id is not None else None

    user = User(email=body.email, full_name=body.full_name, role=body.role, is_active=body.is_active,
                hashed_password=hash_password(body.password), must_change_password=True)
    db.add(user)
    db.flush()
    if body.driver:
        db.add(Driver(user_id=user.id, full_name=body.full_name, **body.driver.model_dump()))
    elif existing:
        existing.user_id = user.id
    record_audit_event(db, admin, AuditAction.ASSET_CREATED, "User", user.id,
                       f"Created {body.role.value} account {body.email}" + (" with a new driver profile" if body.driver else
                                                                           f", linked to driver {existing.full_name}" if existing else ""))
    db.commit()
    db.refresh(user)
    return _response(db, user)


@router.patch("/{user_id}", response_model=ManagedUserResponse, summary="Rename, change role, activate or deactivate")
def update_user(user_id: int, body: ManagedUserUpdate, db: Session = Depends(get_db), admin: User = Depends(admin_only)):
    user = _get_user(db, user_id)
    before = {"full_name": user.full_name, "role": user.role.value, "is_active": user.is_active}
    losing_admin = user.role == UserRole.ADMIN and user.is_active and (
        (body.role is not None and body.role != UserRole.ADMIN) or body.is_active is False)
    if losing_admin and user.id == admin.id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="You cannot deactivate or demote your own admin account")
    if losing_admin and _active_admins(db) <= 1:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="There must always be at least one active admin")

    if body.full_name is not None:
        user.full_name = body.full_name
        if (d := _profile(db, user)):
            d.full_name = body.full_name          # one person, one name on both records
    if body.role is not None and body.role != user.role:
        if user.role == UserRole.DRIVER and (d := _profile(db, user)):
            d.user_id = None                      # the profile stays (history, planning) but loses app access
        user.role = body.role
    if body.is_active is not None:
        user.is_active = body.is_active
    after = {"full_name": user.full_name, "role": user.role.value, "is_active": user.is_active}
    record_audit_event(db, admin, AuditAction.ASSET_UPDATED, "User", user.id, f"Updated account {user.email}", before, after)
    db.commit()
    db.refresh(user)
    return _response(db, user)


@router.post("/{user_id}/reset-password", response_model=TemporaryPassword, summary="Issue a temporary password")
def reset_password(user_id: int, db: Session = Depends(get_db), admin: User = Depends(admin_only)):
    user = _get_user(db, user_id)
    if user.id == admin.id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Use Change password for your own account")
    temporary = secrets.token_urlsafe(9)
    user.hashed_password = hash_password(temporary)
    user.must_change_password = True
    user.reset_requested_at = None
    user.token_version = (user.token_version or 0) + 1
    record_audit_event(db, admin, AuditAction.ASSET_UPDATED, "User", user.id, f"Reset the password of {user.email}",
                       {"password": "previous"}, {"password": "temporary, must be changed"})
    db.commit()
    return TemporaryPassword(temporary_password=temporary)


@router.put("/{user_id}/driver", response_model=ManagedUserResponse, summary="Link or unlink a driver profile")
def link_driver(user_id: int, body: DriverLinkRequest, db: Session = Depends(get_db), admin: User = Depends(admin_only)):
    user = _get_user(db, user_id)
    current = _profile(db, user)
    if body.driver_id is None:
        if current:
            current.user_id = None
            record_audit_event(db, admin, AuditAction.ASSET_UPDATED, "Driver", current.id, f"Unlinked driver {current.full_name} from {user.email}")
    else:
        if user.role != UserRole.DRIVER:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Only DRIVER accounts can have a driver profile")
        target = _free_profile(db, body.driver_id, for_user=user)
        if current and current.id != target.id:
            current.user_id = None
        target.user_id = user.id
        record_audit_event(db, admin, AuditAction.ASSET_UPDATED, "Driver", target.id, f"Linked driver {target.full_name} to {user.email}")
    db.commit()
    db.refresh(user)
    return _response(db, user)

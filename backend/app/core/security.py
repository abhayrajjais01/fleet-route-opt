"""
security.py - Security, Cryptography & Role-Based Access Control (RBAC)

This file implements core security functionality:
1. PBKDF2-HMAC-SHA256 password hashing & verification.
2. JSON Web Token (JWT) encoding, decoding, signature verification, and expiration handling.
3. FastAPI dependency get_current_user() for extracting & verifying incoming Bearer tokens.
4. Declarative RBAC middleware (require_roles) to restrict routes to specific roles (ADMIN, DISPATCHER, DRIVER, FLEET_MANAGER).
"""

import json
import base64
import hashlib
import hmac
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any, List, Callable
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.models.user import User, UserRole
from app.schemas.auth import TokenPayload

# OAuth2 Password Bearer scheme for extracting "Authorization: Bearer <token>" from HTTP headers
oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_V1_STR}/auth/login",
    auto_error=False
)


def hash_password(password: str) -> str:
    """
    Hashes a plain-text password using PBKDF2 with HMAC-SHA256 and 100,000 iterations.
    Uses the system SECRET_KEY to derive a key salt.
    """
    salt = settings.SECRET_KEY[:16].encode("utf-8")
    pwd_hash = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        100000
    )
    return f"pbkdf2_sha256${pwd_hash.hex()}"


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verifies a candidate plain-text password against a stored hash using constant-time comparison (hmac.compare_digest)
    to prevent timing side-channel attacks.
    """
    expected_hash = hash_password(plain_password)
    return hmac.compare_digest(expected_hash, hashed_password)


def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """
    Generates a cryptographically signed JWT access token.
    Contains standard claims: sub (subject/email), user_id, role, exp (expiration timestamp).
    """
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode["exp"] = int(expire.timestamp())

    try:
        from jose import jwt
        return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    except (ImportError, Exception):
        # Native Python fallback if python-jose is unavailable
        header = base64.urlsafe_b64encode(json.dumps({"alg": "HS256", "typ": "JWT"}).encode()).decode().rstrip("=")
        payload = base64.urlsafe_b64encode(json.dumps(to_encode).encode()).decode().rstrip("=")
        signature = hmac.new(settings.SECRET_KEY.encode(), f"{header}.{payload}".encode(), hashlib.sha256).digest()
        sig_str = base64.urlsafe_b64encode(signature).decode().rstrip("=")
        return f"{header}.{payload}.{sig_str}"


def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    """
    Decodes and validates a signed JWT token.
    Verifies HMAC-SHA256 signature against SECRET_KEY and checks expiration timestamp.
    """
    try:
        from jose import jwt, JWTError
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except (ImportError, Exception):
        try:
            parts = token.split(".")
            if len(parts) != 3:
                return None
            header_b64, payload_b64, sig_b64 = parts
            expected_sig = hmac.new(
                settings.SECRET_KEY.encode(),
                f"{header_b64}.{payload_b64}".encode(),
                hashlib.sha256
            ).digest()
            actual_sig = base64.urlsafe_b64decode(sig_b64 + "=" * (-len(sig_b64) % 4))
            if not hmac.compare_digest(expected_sig, actual_sig):
                return None
            payload_json = base64.urlsafe_b64decode(payload_b64 + "=" * (-len(payload_b64) % 4)).decode()
            payload = json.loads(payload_json)
            if "exp" in payload and payload["exp"] < datetime.now(timezone.utc).timestamp():
                return None
            return payload
        except Exception:
            return None


def get_current_user(
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> User:
    """
    FastAPI Dependency: Resolves and validates the current active User object from the JWT Bearer token.
    Raises 401 Unauthorized if token is missing, invalid, or expired.
    Raises 403 Forbidden if user account is deactivated.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate authentication credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise credentials_exception

    payload = decode_access_token(token)
    if not payload:
        raise credentials_exception

    email: Optional[str] = payload.get("sub")
    if not email:
        raise credentials_exception

    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise credentials_exception
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive"
        )
    return user


def require_roles(allowed_roles: List[UserRole]) -> Callable[[User], User]:
    """
    FastAPI Dependency Factory for Role-Based Access Control (RBAC).
    
    Example Usage:
        @router.post("/vehicles", dependencies=[Depends(require_roles([UserRole.ADMIN, UserRole.FLEET_MANAGER]))])
        def create_vehicle(...):
            ...
    """
    def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Operation not permitted. Required role: {[r.value for r in allowed_roles]}, user has: {current_user.role.value}"
            )
        return current_user
    return role_checker

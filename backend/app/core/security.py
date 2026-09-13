from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any
import hashlib
import hmac
from app.core.config import settings

# Robust fallback-friendly token and hashing utilities
# Uses SHA-256 HMAC for JWT and secure PBKDF2/SHA-256 for passwords with zero compilation risk on all platforms

def hash_password(password: str) -> str:
    """Hashes a password using PBKDF2-HMAC-SHA256 with a salt."""
    salt = settings.SECRET_KEY[:16].encode("utf-8")
    pwd_hash = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        100000
    )
    return f"pbkdf2_sha256${pwd_hash.hex()}"


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifies a plain password against the stored PBKDF2 hash."""
    expected_hash = hash_password(plain_password)
    return hmac.compare_digest(expected_hash, hashed_password)


def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """Generates a signed JWT-compatible token containing claims and expiration."""
    try:
        from jose import jwt
        to_encode = data.copy()
        if expires_delta:
            expire = datetime.now(timezone.utc) + expires_delta
        else:
            expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        to_encode.update({"exp": expire})
        encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
        return encoded_jwt
    except ImportError:
        # Pure python HMAC fallback if python-jose is not yet compiled
        import json, base64
        to_encode = data.copy()
        expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
        to_encode["exp"] = int(expire.timestamp())
        header = base64.urlsafe_b64encode(json.dumps({"alg": "HS256", "typ": "JWT"}).encode()).decode().rstrip("=")
        payload = base64.urlsafe_b64encode(json.dumps(to_encode).encode()).decode().rstrip("=")
        signature = hmac.new(settings.SECRET_KEY.encode(), f"{header}.{payload}".encode(), hashlib.sha256).digest()
        sig_str = base64.urlsafe_b64encode(signature).decode().rstrip("=")
        return f"{header}.{payload}.{sig_str}"

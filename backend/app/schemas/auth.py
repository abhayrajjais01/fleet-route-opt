from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, Field, ConfigDict
from app.models.user import UserRole
from app.core.sanitize import CleanStr


class UserBase(BaseModel):
    email: EmailStr
    full_name: CleanStr = Field(..., min_length=2, max_length=100)
    role: UserRole = UserRole.DISPATCHER
    is_active: bool = True


class UserCreate(UserBase):
    password: str = Field(..., min_length=6, max_length=128)


class UserUpdate(BaseModel):
    full_name: Optional[CleanStr] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None
    password: Optional[str] = Field(None, min_length=6)


class UserResponse(UserBase):
    id: int
    must_change_password: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1, max_length=128)
    new_password: str = Field(..., min_length=8, max_length=128, description="At least 8 characters, different from the current one")


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class Message(BaseModel):
    message: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class TokenPayload(BaseModel):
    sub: Optional[str] = None
    role: Optional[str] = None
    exp: Optional[int] = None

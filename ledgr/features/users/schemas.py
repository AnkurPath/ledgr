from enum import Enum
from decimal import Decimal
from typing import Optional
from datetime import datetime

from pydantic import BaseModel, Field, EmailStr


# Never expose user IDs or other internal identifiers in API responses

class CurrencyEnum(str, Enum):
    INR = "INR"
    # TODO: Add more currencies as needed

class UserRegister(BaseModel):
    email: EmailStr = Field(..., min_length=5, max_length=255, description="Email will be used as username")
    password: str = Field(..., min_length=4, max_length=128)
    first_name: Optional[str] = Field(default=None, max_length=80)
    last_name: Optional[str] = Field(default=None, max_length=80)
    age: Optional[int] = Field(default=None, ge=0)



class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int # seconds


class UserLogin(BaseModel):
    email: EmailStr = Field(..., min_length=5, max_length=255)
    password: str = Field(..., min_length=8, max_length=128)


class UserProfile(BaseModel):
    email: EmailStr
    display_name: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class AccountCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    account_type: Optional[str] = Field(default=None, max_length=80)
    opening_balance: Decimal = Field(default=Decimal("0.00"))


class AccountResponse(BaseModel):
    id: int
    user_id: int
    name: str
    account_type: Optional[str] = None
    opening_balance: Decimal
    is_active: bool


class AccountUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    account_type: Optional[str] = Field(default=None, max_length=80)
    opening_balance: Optional[Decimal] = None


class CategoryCreate(BaseModel):
    kind: str = Field(..., min_length=1, max_length=40)
    name: str = Field(..., min_length=1, max_length=120)


class CategoryResponse(BaseModel):
    id: int
    user_id: int
    kind: str
    name: str
    is_active: bool


class TagCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)


class TagResponse(BaseModel):
    id: int
    user_id: int
    name: str
    is_active: bool

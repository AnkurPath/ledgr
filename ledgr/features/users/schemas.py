from enum import Enum
from decimal import Decimal
from typing import Optional
from datetime import datetime

from pydantic import BaseModel, Field, EmailStr


# Never expose user IDs or other internal identifiers in API responses

class CurrencyEnum(str, Enum):
    INR = "INR"
    # TODO: Add more currencies as needed


class CategoryKindEnum(str, Enum):
    INCOME = "income"
    EXPENSE = "expense"
    TRANSFER = "transfer"


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
    currency: CurrencyEnum = Field(default=CurrencyEnum.INR)


class AccountResponse(BaseModel):
    id: int
    user_id: int
    name: str
    account_type: Optional[str] = None
    opening_balance: Decimal
    current_balance: Decimal
    currency: CurrencyEnum
    created_at: datetime
    updated_at: datetime
    is_active: bool


class AccountUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    account_type: Optional[str] = Field(default=None, max_length=80)
    opening_balance: Optional[Decimal] = None
    currency: Optional[CurrencyEnum] = None

    
class CategoryCreate(BaseModel):
    kind: CategoryKindEnum
    name: str = Field(..., min_length=1, max_length=120)


class CategoryResponse(BaseModel):
    id: int
    user_id: Optional[int] = None
    is_global: bool
    kind: CategoryKindEnum
    name: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


class CategoryGroupsResponse(BaseModel):
    income: list[CategoryResponse] = Field(default_factory=list)
    expense: list[CategoryResponse] = Field(default_factory=list)
    transfer: list[CategoryResponse] = Field(default_factory=list)


class TagCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    color: Optional[str] = Field(default=None, max_length=7)  # Hex color code


class TagResponse(BaseModel):
    id: int
    user_id: int
    name: str
    is_active: bool
    color: Optional[str] = Field(default=None, max_length=7)  # Hex color code
    created_at: datetime
    updated_at: datetime


class GoalCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    target_amount: Decimal
    current_amount: Decimal = Field(default=Decimal("0.00"))
    target_date: Optional[datetime] = None


class GoalResponse(BaseModel):
    id: int
    user_id: int
    name: str
    target_amount: Decimal
    current_amount: Decimal
    target_date: Optional[datetime] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime

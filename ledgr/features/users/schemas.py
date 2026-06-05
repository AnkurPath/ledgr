from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


class CategoryKind(str, Enum):
    INCOME = "income"
    NON_INCOME = "non_income"
    EXPENSE = "expense"
    NON_EXPENSE = "non_expense"


class UserCreate(BaseModel):
    username: str = Field(..., min_length=1, max_length=120)
    display_name: Optional[str] = Field(default=None, max_length=120)
    is_active: bool = True

    @field_validator("username", "display_name")
    @classmethod
    def strip_optional_strings(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        stripped = value.strip()
        if not stripped:
            raise ValueError("Value cannot be blank")
        return stripped


class UserUpdate(BaseModel):
    username: Optional[str] = Field(default=None, min_length=1, max_length=120)
    display_name: Optional[str] = Field(default=None, max_length=120)
    is_active: Optional[bool] = None

    @field_validator("username")
    @classmethod
    def strip_username(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        stripped = value.strip()
        if not stripped:
            raise ValueError("Username cannot be blank")
        return stripped

    @field_validator("display_name")
    @classmethod
    def strip_display_name(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None


class User(UserCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime


class UserSetupBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    is_active: bool = True

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("Name cannot be blank")
        return stripped


class AccountCreate(UserSetupBase):
    account_type: Optional[str] = Field(default=None, max_length=80)
    opening_balance: Decimal = Field(default=Decimal("0.00"), decimal_places=2)

    @field_validator("account_type")
    @classmethod
    def strip_account_type(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None


class AccountUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    account_type: Optional[str] = Field(default=None, max_length=80)
    opening_balance: Optional[Decimal] = Field(default=None, decimal_places=2)
    is_active: Optional[bool] = None

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        stripped = value.strip()
        if not stripped:
            raise ValueError("Name cannot be blank")
        return stripped

    @field_validator("account_type")
    @classmethod
    def strip_account_type(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None


class Account(AccountCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime


class CategoryCreate(UserSetupBase):
    kind: CategoryKind


class CategoryUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    kind: Optional[CategoryKind] = None
    is_active: Optional[bool] = None

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        stripped = value.strip()
        if not stripped:
            raise ValueError("Name cannot be blank")
        return stripped


class Category(CategoryCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime


class TagCreate(UserSetupBase):
    pass


class TagUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=80)
    is_active: Optional[bool] = None

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        stripped = value.strip()
        if not stripped:
            raise ValueError("Name cannot be blank")
        return stripped


class Tag(TagCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime

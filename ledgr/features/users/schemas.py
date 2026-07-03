from enum import Enum
from decimal import Decimal
from typing import Optional
from datetime import datetime

from pydantic import BaseModel, Field, EmailStr, model_validator


# Never expose user IDs or other internal identifiers in API responses

class CurrencyEnum(str, Enum):
    INR = "INR"
    # TODO: Add more currencies as needed


class CategoryKindEnum(str, Enum):
    INCOME = "income"
    EXPENSE = "expense"
    TRANSFER = "transfer"
    INVESTMENT = "investment"
    REFUND = "refund"


class AccountTypeEnum(str, Enum):
    BANK_ACCOUNT = "bank account"
    CREDIT_CARD = "credit card"
    WALLET = "wallet"


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
    account_type: AccountTypeEnum
    opening_balance: Decimal = Field(default=Decimal("0.00"))
    currency: CurrencyEnum = Field(default=CurrencyEnum.INR)
    card_number: Optional[str] = Field(default=None, max_length=16)
    expiration_date: Optional[datetime] = None
    credit_limit: Optional[Decimal] = None
    billing_cycle_start: Optional[int] = Field(default=None, ge=1, le=31)
    billing_cycle_end: Optional[int] = Field(default=None, ge=1, le=31)
    notes: Optional[str] = Field(default=None, max_length=255)

    @model_validator(mode="after")
    def validate_fields_for_account_type(self) -> "AccountCreate":
        credit_card_fields = {
            "card_number": self.card_number,
            "expiration_date": self.expiration_date,
            "credit_limit": self.credit_limit,
            "billing_cycle_start": self.billing_cycle_start,
            "billing_cycle_end": self.billing_cycle_end,
        }
        provided_credit_card_fields = [field for field, value in credit_card_fields.items() if value is not None]

        if self.account_type != AccountTypeEnum.CREDIT_CARD and provided_credit_card_fields:
            raise ValueError("Credit card fields are only allowed for credit card accounts")

        if self.account_type == AccountTypeEnum.CREDIT_CARD:
            required_fields = {"expiration_date": self.expiration_date, "credit_limit": self.credit_limit}
            missing_fields = [field for field, value in required_fields.items() if value is None]
            if missing_fields:
                raise ValueError(f"Missing required credit card fields: {', '.join(missing_fields)}")

        return self


class AccountResponse(BaseModel):
    id: int
    user_id: int
    name: str
    account_type: AccountTypeEnum
    opening_balance: Decimal
    current_balance: Decimal
    currency: CurrencyEnum
    card_number: Optional[str] = None
    expiration_date: Optional[datetime] = None
    credit_limit: Optional[Decimal] = None
    billing_cycle_start: Optional[int] = None
    billing_cycle_end: Optional[int] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    is_active: bool


class AccountUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    account_type: Optional[AccountTypeEnum] = None
    opening_balance: Optional[Decimal] = None
    currency: Optional[CurrencyEnum] = None
    card_number: Optional[str] = Field(default=None, max_length=16)
    expiration_date: Optional[datetime] = None
    credit_limit: Optional[Decimal] = None
    billing_cycle_start: Optional[int] = Field(default=None, ge=1, le=31)
    billing_cycle_end: Optional[int] = Field(default=None, ge=1, le=31)
    notes: Optional[str] = Field(default=None, max_length=255)

    def provided_credit_card_fields(self) -> set[str]:
        return {
            field
            for field in {
                "card_number",
                "expiration_date",
                "credit_limit",
                "billing_cycle_start",
                "billing_cycle_end",
            }
            if field in self.model_fields_set
        }

    
class DefaultAccountsOpeningBalanceSetup(BaseModel):
    cash_opening_balance: Decimal
    pending_from_friends_opening_balance: Decimal


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
    investment: list[CategoryResponse] = Field(default_factory=list)
    refund: list[CategoryResponse] = Field(default_factory=list)


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


class BudgetCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    amount: Decimal = Field(..., gt=0)
    category_id: Optional[int] = None
    start_date: datetime
    end_date: datetime
    notes: Optional[str] = Field(default=None, max_length=255)

    @model_validator(mode="after")
    def validate_dates(self) -> "BudgetCreate":
        if self.end_date < self.start_date:
            raise ValueError("end_date must be greater than or equal to start_date")
        return self


class BudgetResponse(BaseModel):
    id: int
    user_id: int
    name: str
    amount: Decimal
    category_id: Optional[int] = None
    start_date: datetime
    end_date: datetime
    notes: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    spent_amount: Decimal = Field(default=Decimal("0.00"))
    remaining_amount: Decimal = Field(default=Decimal("0.00"))

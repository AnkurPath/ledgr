from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


MONEY_QUANT = Decimal("0.01")


def decimal_to_cents(value: Decimal) -> int:
    quantized = value.quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)
    return int(quantized * 100)


def cents_to_decimal(value: int) -> Decimal:
    return (Decimal(value) / Decimal(100)).quantize(MONEY_QUANT)


class ExpenseBase(BaseModel):
    expense_date: date = Field(..., description="Date the expense occurred.")
    description: str = Field(..., min_length=1, max_length=200)
    amount: Decimal = Field(..., gt=0, decimal_places=2)
    category: Optional[str] = Field(default=None, max_length=80)
    payment_method: Optional[str] = Field(default=None, max_length=80)
    notes: Optional[str] = Field(default=None, max_length=500)

    @field_validator("description", "category", "payment_method", "notes")
    @classmethod
    def strip_blank_strings(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None


class ExpenseCreate(ExpenseBase):
    pass


class ExpenseUpdate(BaseModel):
    expense_date: Optional[date] = None
    description: Optional[str] = Field(default=None, min_length=1, max_length=200)
    amount: Optional[Decimal] = Field(default=None, gt=0, decimal_places=2)
    category: Optional[str] = Field(default=None, max_length=80)
    payment_method: Optional[str] = Field(default=None, max_length=80)
    notes: Optional[str] = Field(default=None, max_length=500)

    @field_validator("description", "category", "payment_method", "notes")
    @classmethod
    def strip_blank_strings(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None


class Expense(ExpenseBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime


class DailyExpenseSummary(BaseModel):
    expense_date: date
    total_amount: Decimal
    expense_count: int

from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import CheckConstraint, Column, DateTime, Numeric, Text, func
from sqlmodel import Field, SQLModel


class ExpenseModel(SQLModel, table=True):
    __tablename__ = "expenses"
    __table_args__ = (
        CheckConstraint("amount > 0", name="ck_expenses_amount_positive"),
    )

    id: Optional[int] = Field(default=None, primary_key=True, index=True)
    expense_date: date = Field(index=True)
    description: str = Field(max_length=200)
    amount: Decimal = Field(sa_column=Column(Numeric(12, 2), nullable=False))
    category: Optional[str] = Field(default=None, max_length=80, index=True)
    payment_method: Optional[str] = Field(default=None, max_length=80)
    notes: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(
            DateTime(timezone=True),
            nullable=False,
            server_default=func.now(),
        ),
    )
    updated_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(
            DateTime(timezone=True),
            nullable=False,
            server_default=func.now(),
            onupdate=func.now(),
        ),
    )

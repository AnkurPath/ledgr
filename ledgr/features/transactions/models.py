from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import CheckConstraint, Column, DateTime, Numeric, UniqueConstraint, func
from sqlmodel import Field, SQLModel, String


class TransactionModel(SQLModel, table=True):
    __tablename__ = "transactions"
    __table_args__ = (
        UniqueConstraint("user_id", "account_id", "date", "amount", name="uq_transactions_user_account_date_amount"),
    )

    id: Optional[int] = Field(default=None, primary_key=True, index=True)
    user_id: int = Field(foreign_key="users.id", index=True, nullable=False)
    date: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now()))
    merchant: Optional[str] = Field(default=None, max_length=120)
    product: Optional[str] = Field(default=None, max_length=120)
    amount: Decimal = Field(sa_column=Column(Numeric(14, 2), nullable=False))
    account_id: int = Field(foreign_key="accounts.id", index=True, nullable=False)
    transaction_type: str = Field(sa_column=Column(String(10), nullable=False))
    category_id: Optional[int] = Field(foreign_key="categories.id", index=True, default=None)
    tag_id: Optional[int] = Field(foreign_key="tags.id", index=True, default=None)
    goal_id: Optional[int] = Field(foreign_key="goals.id", index=True, default=None)
    notes: Optional[str] = Field(default=None, max_length=255)
    bills: Optional[str] = Field(default=None, max_length=255)
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

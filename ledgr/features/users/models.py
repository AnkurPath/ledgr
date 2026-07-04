from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy import CheckConstraint, Column, DateTime, Numeric, UniqueConstraint, func
from sqlmodel import Field, SQLModel, String


class UserModel(SQLModel, table=True):
    __tablename__ = "users"

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    email: str = Field(max_length=120, unique=True, index=True)
    hashed_password: str = Field(max_length=255, nullable=False)
    first_name: Optional[str] = Field(default=None, max_length=80)
    last_name: Optional[str] = Field(default=None, max_length=80)
    age: Optional[int] = Field(default=None, ge=0)
    is_active: bool = Field(default=True)
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


class AccountModel(SQLModel, table=True):
    __tablename__ = "accounts"
    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_accounts_user_id_name"),
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    user_id: UUID = Field(foreign_key="users.id", index=True, nullable=False)
    name: str = Field(max_length=120, index=True)
    account_type: Optional[str] = Field(default=None, max_length=80)
    opening_balance: Decimal = Field(default=Decimal("0.00"), sa_column=Column(Numeric(14, 2), nullable=False))
    current_balance: Decimal = Field(default=Decimal("0.00"), sa_column=Column(Numeric(14, 2), nullable=False))
    currency: str = Field(default="INR", max_length=3, sa_column=Column(String(3), nullable=False))
    card_number: Optional[str] = Field(default=None, max_length=16, index=True)
    expiration_date: Optional[datetime] = Field(default=None)
    credit_limit: Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(14, 2), nullable=True))
    billing_cycle_start: Optional[int] = Field(default=None, ge=1, le=31)
    billing_cycle_end: Optional[int] = Field(default=None, ge=1, le=31)
    notes: Optional[str] = Field(default=None, max_length=255)
    is_active: bool = Field(default=True, nullable=False)
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


class CategoryModel(SQLModel, table=True):
    __tablename__ = "categories"
    __table_args__ = (
        UniqueConstraint("user_id", "kind", "name", name="uq_categories_user_id_kind_name"),
        CheckConstraint(
            "kind in ('income', 'expense', 'transfer', 'investment', 'refund')",
            name="ck_categories_kind",
        ),
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    user_id: Optional[UUID] = Field(default=None, foreign_key="users.id", index=True, nullable=True)
    is_global: bool = Field(default=False, nullable=False)
    kind: str = Field(max_length=40, index=True)
    name: str = Field(max_length=120, index=True)
    is_active: bool = Field(default=True, nullable=False)
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

class TagModel(SQLModel, table=True):
    __tablename__ = "tags"
    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_tags_user_id_name"),
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    user_id: Optional[UUID] = Field(default=None, foreign_key="users.id", index=True, nullable=True)
    is_global: bool = Field(default=False, nullable=False) 
    name: str = Field(max_length=80, index=True)
    color: Optional[str] = Field(default=None, max_length=7)  # Hex color code
    is_active: bool = Field(default=True, nullable=False)
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

class GoalModel(SQLModel, table=True):
    __tablename__ = "goals"
    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_goals_user_id_name"),
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    user_id: UUID = Field(foreign_key="users.id", index=True, nullable=False)
    name: str = Field(max_length=120, index=True)
    target_amount: Decimal = Field(sa_column=Column(Numeric(14, 2), nullable=False))
    current_amount: Decimal = Field(default=Decimal("0.00"), sa_column=Column(Numeric(14, 2), nullable=False))
    target_date: Optional[datetime] = Field(default=None)
    is_active: bool = Field(default=True, nullable=False)
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


class BudgetModel(SQLModel, table=True):
    __tablename__ = "budgets"
    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_budgets_user_id_name"),
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    user_id: UUID = Field(foreign_key="users.id", index=True, nullable=False)
    name: str = Field(max_length=120, index=True)
    amount: Decimal = Field(sa_column=Column(Numeric(14, 2), nullable=False))
    category_id: Optional[UUID] = Field(default=None, foreign_key="categories.id", index=True, nullable=True)
    start_date: datetime = Field(nullable=False)
    end_date: datetime = Field(nullable=False)
    notes: Optional[str] = Field(default=None, max_length=255)
    is_active: bool = Field(default=True, nullable=False)
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

    is_active: bool = Field(default=True, nullable=False)
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

class NetWorthModel(SQLModel, table=True):
    __tablename__ = "net_worth"
    __table_args__ = (
        UniqueConstraint("user_id", "date", name="uq_net_worth_user_id_date"),
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    user_id: UUID = Field(foreign_key="users.id", index=True, nullable=False)
    date: datetime = Field(nullable=False)
    net_worth: Decimal = Field(default=Decimal("0.00"), sa_column=Column(Numeric(14, 2), nullable=False))
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(
            DateTime(timezone=True),
            nullable=False,
            server_default=func.now(),
        ),
    )
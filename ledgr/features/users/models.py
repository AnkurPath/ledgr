from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, Numeric, UniqueConstraint, func
from sqlmodel import Field, SQLModel


class UserModel(SQLModel, table=True):
    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("username", name="uq_users_username"),
    )

    id: Optional[int] = Field(default=None, primary_key=True, index=True)
    username: str = Field(max_length=120, index=True)
    display_name: Optional[str] = Field(default=None, max_length=120)
    is_active: bool = Field(default=True)
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now()),
    )
    updated_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()),
    )


class UserAccountModel(SQLModel, table=True):
    __tablename__ = "user_accounts"
    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_user_accounts_user_id_name"),
    )

    id: Optional[int] = Field(default=None, primary_key=True, index=True)
    user_id: int = Field(sa_column=Column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True))
    name: str = Field(max_length=120, index=True)
    account_type: Optional[str] = Field(default=None, max_length=80)
    opening_balance: Decimal = Field(default=Decimal("0.00"), sa_column=Column(Numeric(14, 2), nullable=False))
    is_active: bool = Field(default=True)
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now()),
    )
    updated_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()),
    )


class UserCategoryModel(SQLModel, table=True):
    __tablename__ = "user_categories"
    __table_args__ = (
        UniqueConstraint("user_id", "kind", "name", name="uq_user_categories_user_id_kind_name"),
        CheckConstraint(
            "kind in ('income', 'non_income', 'expense', 'non_expense')",
            name="ck_user_categories_kind",
        ),
    )

    id: Optional[int] = Field(default=None, primary_key=True, index=True)
    user_id: int = Field(sa_column=Column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True))
    kind: str = Field(max_length=40, index=True)
    name: str = Field(max_length=120, index=True)
    is_active: bool = Field(default=True)
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now()),
    )
    updated_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()),
    )


class UserTagModel(SQLModel, table=True):
    __tablename__ = "user_tags"
    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_user_tags_user_id_name"),
    )

    id: Optional[int] = Field(default=None, primary_key=True, index=True)
    user_id: int = Field(sa_column=Column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True))
    name: str = Field(max_length=80, index=True)
    is_active: bool = Field(default=True)
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now()),
    )
    updated_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()),
    )

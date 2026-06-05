"""create user setup

Revision ID: 0002_create_user_setup
Revises: 0001_create_expenses
Create Date: 2026-06-04
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0002_create_user_setup"
down_revision: Union[str, None] = "0001_create_expenses"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("username", sa.String(length=120), nullable=False),
        sa.Column("display_name", sa.String(length=120), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("username", name="uq_users_username"),
    )
    op.create_index(op.f("ix_users_id"), "users", ["id"], unique=False)
    op.create_index(op.f("ix_users_username"), "users", ["username"], unique=False)

    op.create_table(
        "user_accounts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("account_type", sa.String(length=80), nullable=True),
        sa.Column("opening_balance", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "name", name="uq_user_accounts_user_id_name"),
    )
    op.create_index(op.f("ix_user_accounts_id"), "user_accounts", ["id"], unique=False)
    op.create_index(op.f("ix_user_accounts_name"), "user_accounts", ["name"], unique=False)
    op.create_index(op.f("ix_user_accounts_user_id"), "user_accounts", ["user_id"], unique=False)

    op.create_table(
        "user_categories",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(length=40), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "kind in ('income', 'non_income', 'expense', 'non_expense')",
            name="ck_user_categories_kind",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "kind", "name", name="uq_user_categories_user_id_kind_name"),
    )
    op.create_index(op.f("ix_user_categories_id"), "user_categories", ["id"], unique=False)
    op.create_index(op.f("ix_user_categories_kind"), "user_categories", ["kind"], unique=False)
    op.create_index(op.f("ix_user_categories_name"), "user_categories", ["name"], unique=False)
    op.create_index(op.f("ix_user_categories_user_id"), "user_categories", ["user_id"], unique=False)

    op.create_table(
        "user_tags",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "name", name="uq_user_tags_user_id_name"),
    )
    op.create_index(op.f("ix_user_tags_id"), "user_tags", ["id"], unique=False)
    op.create_index(op.f("ix_user_tags_name"), "user_tags", ["name"], unique=False)
    op.create_index(op.f("ix_user_tags_user_id"), "user_tags", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_user_tags_user_id"), table_name="user_tags")
    op.drop_index(op.f("ix_user_tags_name"), table_name="user_tags")
    op.drop_index(op.f("ix_user_tags_id"), table_name="user_tags")
    op.drop_table("user_tags")
    op.drop_index(op.f("ix_user_categories_user_id"), table_name="user_categories")
    op.drop_index(op.f("ix_user_categories_name"), table_name="user_categories")
    op.drop_index(op.f("ix_user_categories_kind"), table_name="user_categories")
    op.drop_index(op.f("ix_user_categories_id"), table_name="user_categories")
    op.drop_table("user_categories")
    op.drop_index(op.f("ix_user_accounts_user_id"), table_name="user_accounts")
    op.drop_index(op.f("ix_user_accounts_name"), table_name="user_accounts")
    op.drop_index(op.f("ix_user_accounts_id"), table_name="user_accounts")
    op.drop_table("user_accounts")
    op.drop_index(op.f("ix_users_username"), table_name="users")
    op.drop_index(op.f("ix_users_id"), table_name="users")
    op.drop_table("users")

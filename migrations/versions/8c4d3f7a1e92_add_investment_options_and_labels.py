"""Add investment options and labels

Revision ID: 8c4d3f7a1e92
Revises: 2b72ab7299a4
Create Date: 2026-07-08 21:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "8c4d3f7a1e92"
down_revision: Union[str, Sequence[str], None] = "2b72ab7299a4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(table_name: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return table_name in inspector.get_table_names()


def _column_exists(table_name: str, column_name: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if table_name not in inspector.get_table_names():
        return False
    return any(column["name"] == column_name for column in inspector.get_columns(table_name))


def upgrade() -> None:
    """Upgrade schema."""
    if not _table_exists("investment_options"):
        op.create_table(
            "investment_options",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("asset_type", sa.String(length=40), nullable=False),
            sa.Column("field_name", sa.String(length=40), nullable=False),
            sa.Column("display_name", sa.String(length=120), nullable=False),
            sa.Column("sort_order", sa.Integer(), nullable=False, server_default=sa.text("0")),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "asset_type",
                "field_name",
                "display_name",
                name="uq_investment_options_asset_field_display_name",
            ),
        )
        op.create_index(op.f("ix_investment_options_id"), "investment_options", ["id"], unique=False)
        op.create_index(op.f("ix_investment_options_asset_type"), "investment_options", ["asset_type"], unique=False)
        op.create_index(op.f("ix_investment_options_field_name"), "investment_options", ["field_name"], unique=False)
        op.create_index(op.f("ix_investment_options_display_name"), "investment_options", ["display_name"], unique=False)

    if _table_exists("stock_investments") and not _column_exists("stock_investments", "sector_option_id"):
        op.add_column("stock_investments", sa.Column("sector_option_id", sa.Uuid(), nullable=True))
        op.create_index(op.f("ix_stock_investments_sector_option_id"), "stock_investments", ["sector_option_id"], unique=False)
        op.create_foreign_key(
            "fk_stock_investments_sector_option_id",
            "stock_investments",
            "investment_options",
            ["sector_option_id"],
            ["id"],
        )

    if _table_exists("mutual_fund_investments") and not _column_exists("mutual_fund_investments", "category_option_id"):
        op.add_column("mutual_fund_investments", sa.Column("category_option_id", sa.Uuid(), nullable=True))
        op.create_index(
            op.f("ix_mutual_fund_investments_category_option_id"),
            "mutual_fund_investments",
            ["category_option_id"],
            unique=False,
        )
        op.create_foreign_key(
            "fk_mutual_fund_investments_category_option_id",
            "mutual_fund_investments",
            "investment_options",
            ["category_option_id"],
            ["id"],
        )

    if not _table_exists("international_investments"):
        op.create_table(
            "international_investments",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("user_id", sa.Uuid(), nullable=False),
            sa.Column("goal_id", sa.Uuid(), nullable=True),
            sa.Column("symbol", sa.String(length=25), nullable=False),
            sa.Column("security_name", sa.String(length=250), nullable=True),
            sa.Column("market", sa.String(length=25), nullable=False),
            sa.Column("instrument_type", sa.String(length=25), nullable=False),
            sa.Column("quantity", sa.Numeric(precision=14, scale=3), nullable=False),
            sa.Column("avg_price", sa.Numeric(precision=14, scale=3), nullable=False),
            sa.Column("current_price", sa.Numeric(precision=14, scale=3), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
            sa.ForeignKeyConstraint(["goal_id"], ["goals.id"]),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("user_id", "symbol", name="uq_international_investments_user_symbol"),
        )
        op.create_index(op.f("ix_international_investments_id"), "international_investments", ["id"], unique=False)
        op.create_index(op.f("ix_international_investments_user_id"), "international_investments", ["user_id"], unique=False)
        op.create_index(op.f("ix_international_investments_goal_id"), "international_investments", ["goal_id"], unique=False)
        op.create_index(op.f("ix_international_investments_symbol"), "international_investments", ["symbol"], unique=False)
        op.create_index(
            op.f("ix_international_investments_security_name"),
            "international_investments",
            ["security_name"],
            unique=False,
        )
        op.create_index(op.f("ix_international_investments_market"), "international_investments", ["market"], unique=False)
        op.create_index(
            op.f("ix_international_investments_instrument_type"),
            "international_investments",
            ["instrument_type"],
            unique=False,
        )
        op.create_index(op.f("ix_international_investments_quantity"), "international_investments", ["quantity"], unique=False)
        op.create_index(op.f("ix_international_investments_avg_price"), "international_investments", ["avg_price"], unique=False)
        op.create_index(
            op.f("ix_international_investments_current_price"),
            "international_investments",
            ["current_price"],
            unique=False,
        )


def downgrade() -> None:
    """Downgrade schema."""
    if _table_exists("international_investments"):
        op.drop_index(op.f("ix_international_investments_current_price"), table_name="international_investments")
        op.drop_index(op.f("ix_international_investments_avg_price"), table_name="international_investments")
        op.drop_index(op.f("ix_international_investments_quantity"), table_name="international_investments")
        op.drop_index(op.f("ix_international_investments_instrument_type"), table_name="international_investments")
        op.drop_index(op.f("ix_international_investments_market"), table_name="international_investments")
        op.drop_index(op.f("ix_international_investments_security_name"), table_name="international_investments")
        op.drop_index(op.f("ix_international_investments_symbol"), table_name="international_investments")
        op.drop_index(op.f("ix_international_investments_goal_id"), table_name="international_investments")
        op.drop_index(op.f("ix_international_investments_user_id"), table_name="international_investments")
        op.drop_index(op.f("ix_international_investments_id"), table_name="international_investments")
        op.drop_table("international_investments")

    if _column_exists("mutual_fund_investments", "category_option_id"):
        op.drop_constraint("fk_mutual_fund_investments_category_option_id", "mutual_fund_investments", type_="foreignkey")
        op.drop_index(op.f("ix_mutual_fund_investments_category_option_id"), table_name="mutual_fund_investments")
        op.drop_column("mutual_fund_investments", "category_option_id")

    if _column_exists("stock_investments", "sector_option_id"):
        op.drop_constraint("fk_stock_investments_sector_option_id", "stock_investments", type_="foreignkey")
        op.drop_index(op.f("ix_stock_investments_sector_option_id"), table_name="stock_investments")
        op.drop_column("stock_investments", "sector_option_id")

    if _table_exists("investment_options"):
        op.drop_index(op.f("ix_investment_options_display_name"), table_name="investment_options")
        op.drop_index(op.f("ix_investment_options_field_name"), table_name="investment_options")
        op.drop_index(op.f("ix_investment_options_asset_type"), table_name="investment_options")
        op.drop_index(op.f("ix_investment_options_id"), table_name="investment_options")
        op.drop_table("investment_options")

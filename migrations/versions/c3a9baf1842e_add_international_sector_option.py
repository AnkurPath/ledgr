"""Add international sector option

Revision ID: c3a9baf1842e
Revises: 8c4d3f7a1e92
Create Date: 2026-07-08 21:35:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c3a9baf1842e"
down_revision: Union[str, Sequence[str], None] = "8c4d3f7a1e92"
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
    if _table_exists("international_investments") and not _column_exists("international_investments", "sector_option_id"):
        op.add_column("international_investments", sa.Column("sector_option_id", sa.Uuid(), nullable=True))
        op.create_index(
            op.f("ix_international_investments_sector_option_id"),
            "international_investments",
            ["sector_option_id"],
            unique=False,
        )
        op.create_foreign_key(
            "fk_international_investments_sector_option_id",
            "international_investments",
            "investment_options",
            ["sector_option_id"],
            ["id"],
        )


def downgrade() -> None:
    """Downgrade schema."""
    if _column_exists("international_investments", "sector_option_id"):
        op.drop_constraint(
            "fk_international_investments_sector_option_id",
            "international_investments",
            type_="foreignkey",
        )
        op.drop_index(op.f("ix_international_investments_sector_option_id"), table_name="international_investments")
        op.drop_column("international_investments", "sector_option_id")

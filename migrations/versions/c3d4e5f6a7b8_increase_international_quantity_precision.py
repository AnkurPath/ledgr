"""increase international quantity precision

Revision ID: c3d4e5f6a7b8
Revises: b7c8d9e0f1a2
Create Date: 2026-07-11 23:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, Sequence[str], None] = "b7c8d9e0f1a2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "international_investments",
        "quantity",
        existing_type=sa.Numeric(precision=14, scale=3),
        type_=sa.Numeric(precision=17, scale=6),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "international_investments",
        "quantity",
        existing_type=sa.Numeric(precision=17, scale=6),
        type_=sa.Numeric(precision=14, scale=3),
        existing_nullable=False,
    )

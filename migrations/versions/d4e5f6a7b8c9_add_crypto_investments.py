"""add crypto investments table

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-07-18 18:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, Sequence[str], None] = "c3d4e5f6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "crypto_investments",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("goal_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("sector_option_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("symbol", sa.String(length=25), nullable=False),
        sa.Column("asset_name", sa.String(length=250), nullable=True),
        sa.Column("quantity", sa.Numeric(precision=17, scale=6), nullable=False),
        sa.Column("avg_price", sa.Numeric(precision=14, scale=3), nullable=False),
        sa.Column("current_price", sa.Numeric(precision=14, scale=3), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["goal_id"], ["goals.id"]),
        sa.ForeignKeyConstraint(["sector_option_id"], ["investment_options.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_crypto_investments_id"), "crypto_investments", ["id"], unique=False)
    op.create_index(op.f("ix_crypto_investments_user_id"), "crypto_investments", ["user_id"], unique=False)
    op.create_index(op.f("ix_crypto_investments_goal_id"), "crypto_investments", ["goal_id"], unique=False)
    op.create_index(
        op.f("ix_crypto_investments_sector_option_id"), "crypto_investments", ["sector_option_id"], unique=False
    )
    op.create_index(op.f("ix_crypto_investments_symbol"), "crypto_investments", ["symbol"], unique=False)
    op.create_index(op.f("ix_crypto_investments_asset_name"), "crypto_investments", ["asset_name"], unique=False)
    op.create_index(op.f("ix_crypto_investments_quantity"), "crypto_investments", ["quantity"], unique=False)
    op.create_index(op.f("ix_crypto_investments_avg_price"), "crypto_investments", ["avg_price"], unique=False)
    op.create_index(
        op.f("ix_crypto_investments_current_price"), "crypto_investments", ["current_price"], unique=False
    )
    op.execute(
        """
        CREATE UNIQUE INDEX uq_crypto_investments_user_symbol_goal
        ON crypto_investments (user_id, symbol, goal_id)
        WHERE goal_id IS NOT NULL
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX uq_crypto_investments_user_symbol_no_goal
        ON crypto_investments (user_id, symbol)
        WHERE goal_id IS NULL
        """
    )

    # Migrate legacy Crypto INVESTMENT transactions into crypto_investments.
    op.execute(
        """
        INSERT INTO crypto_investments (
            id, user_id, goal_id, sector_option_id, symbol, asset_name,
            quantity, avg_price, current_price, created_at, updated_at
        )
        SELECT
            gen_random_uuid(),
            t.user_id,
            t.goal_id,
            NULL,
            UPPER(LEFT(COALESCE(NULLIF(TRIM(t.merchant), ''), 'CRYPTO'), 25)) AS symbol,
            COALESCE(NULLIF(TRIM(MAX(t.merchant)), ''), 'Crypto'),
            1.000000,
            SUM(ABS(t.amount)),
            SUM(ABS(t.amount)),
            MIN(COALESCE(t.date, now())),
            now()
        FROM transactions t
        JOIN categories c ON c.id = t.category_id
        WHERE t.transaction_type = 'INVESTMENT'
          AND c.name = 'Crypto'
        GROUP BY
            t.user_id,
            t.goal_id,
            UPPER(LEFT(COALESCE(NULLIF(TRIM(t.merchant), ''), 'CRYPTO'), 25))
        """
    )
    op.execute(
        """
        DELETE FROM transactions t
        USING categories c
        WHERE t.category_id = c.id
          AND t.transaction_type = 'INVESTMENT'
          AND c.name = 'Crypto'
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_crypto_investments_user_symbol_no_goal")
    op.execute("DROP INDEX IF EXISTS uq_crypto_investments_user_symbol_goal")
    op.drop_index(op.f("ix_crypto_investments_current_price"), table_name="crypto_investments")
    op.drop_index(op.f("ix_crypto_investments_avg_price"), table_name="crypto_investments")
    op.drop_index(op.f("ix_crypto_investments_quantity"), table_name="crypto_investments")
    op.drop_index(op.f("ix_crypto_investments_asset_name"), table_name="crypto_investments")
    op.drop_index(op.f("ix_crypto_investments_symbol"), table_name="crypto_investments")
    op.drop_index(op.f("ix_crypto_investments_sector_option_id"), table_name="crypto_investments")
    op.drop_index(op.f("ix_crypto_investments_goal_id"), table_name="crypto_investments")
    op.drop_index(op.f("ix_crypto_investments_user_id"), table_name="crypto_investments")
    op.drop_index(op.f("ix_crypto_investments_id"), table_name="crypto_investments")
    op.drop_table("crypto_investments")

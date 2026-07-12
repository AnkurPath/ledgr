"""allow same investment under different goals

Revision ID: b7c8d9e0f1a2
Revises: a1b2c3d4e5f6
Create Date: 2026-07-11 21:40:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "b7c8d9e0f1a2"
down_revision: Union[str, Sequence[str], None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint("uq_mutual_fund_investments_user_scheme_code", "mutual_fund_investments", type_="unique")
    op.execute(
        """
        CREATE UNIQUE INDEX uq_mutual_fund_investments_user_scheme_goal
        ON mutual_fund_investments (user_id, scheme_code, goal_id)
        WHERE goal_id IS NOT NULL
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX uq_mutual_fund_investments_user_scheme_no_goal
        ON mutual_fund_investments (user_id, scheme_code)
        WHERE goal_id IS NULL
        """
    )

    op.drop_constraint("uq_stock_investments_user_symbol", "stock_investments", type_="unique")
    op.execute(
        """
        CREATE UNIQUE INDEX uq_stock_investments_user_symbol_goal
        ON stock_investments (user_id, symbol, goal_id)
        WHERE goal_id IS NOT NULL
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX uq_stock_investments_user_symbol_no_goal
        ON stock_investments (user_id, symbol)
        WHERE goal_id IS NULL
        """
    )

    op.drop_constraint("uq_international_investments_user_symbol", "international_investments", type_="unique")
    op.execute(
        """
        CREATE UNIQUE INDEX uq_international_investments_user_symbol_goal
        ON international_investments (user_id, symbol, goal_id)
        WHERE goal_id IS NOT NULL
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX uq_international_investments_user_symbol_no_goal
        ON international_investments (user_id, symbol)
        WHERE goal_id IS NULL
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_international_investments_user_symbol_no_goal")
    op.execute("DROP INDEX IF EXISTS uq_international_investments_user_symbol_goal")
    op.create_unique_constraint(
        "uq_international_investments_user_symbol",
        "international_investments",
        ["user_id", "symbol"],
    )

    op.execute("DROP INDEX IF EXISTS uq_stock_investments_user_symbol_no_goal")
    op.execute("DROP INDEX IF EXISTS uq_stock_investments_user_symbol_goal")
    op.create_unique_constraint(
        "uq_stock_investments_user_symbol",
        "stock_investments",
        ["user_id", "symbol"],
    )

    op.execute("DROP INDEX IF EXISTS uq_mutual_fund_investments_user_scheme_no_goal")
    op.execute("DROP INDEX IF EXISTS uq_mutual_fund_investments_user_scheme_goal")
    op.create_unique_constraint(
        "uq_mutual_fund_investments_user_scheme_code",
        "mutual_fund_investments",
        ["user_id", "scheme_code"],
    )

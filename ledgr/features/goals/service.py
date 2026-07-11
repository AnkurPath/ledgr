from decimal import Decimal
from uuid import UUID

from sqlmodel import Session, select

from ledgr.features.users.models import GoalModel

DEFAULT_PREDEFINED_GOALS: tuple[tuple[str, Decimal], ...] = (
    ("Emergency Fund (12 months)", Decimal("600000.00")),
    ("Retirement", Decimal("5000000.00")),
    ("Home", Decimal("3000000.00")),
    ("Car", Decimal("1000000.00")),
    ("Child Education", Decimal("2500000.00")),
    ("Marriage", Decimal("1500000.00")),
    ("Travel", Decimal("300000.00")),
)


def ensure_predefined_goals(session: Session, user_id: UUID) -> None:
    existing_names = set(session.exec(select(GoalModel.name).where(GoalModel.user_id == user_id)).all())
    missing_goals = [
        GoalModel(
            user_id=user_id,
            name=goal_name,
            target_amount=target_amount,
            current_amount=Decimal("0.00"),
        )
        for goal_name, target_amount in DEFAULT_PREDEFINED_GOALS
        if goal_name not in existing_names
    ]
    if not missing_goals:
        return

    for goal in missing_goals:
        session.add(goal)
    session.commit()

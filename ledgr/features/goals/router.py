from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select
from uuid import UUID

from ledgr.core.db import get_session
from ledgr.core.security import get_current_user
from ledgr.features.goals.service import list_goal_templates
from ledgr.features.investments.service import recalculate_goal_current_amount
from ledgr.features.users.models import GoalModel, UserModel
from ledgr.features.users.schemas import GoalCreate, GoalResponse, GoalTemplateResponse, GoalUpdate

router = APIRouter(prefix="/goals", tags=["goals"])


@router.get("/templates", response_model=list[GoalTemplateResponse])
def get_goal_templates(
    current_user: UserModel = Depends(get_current_user),
) -> list[GoalTemplateResponse]:
    del current_user
    return [GoalTemplateResponse(**template) for template in list_goal_templates()]


@router.get("", response_model=list[GoalResponse])
def list_goals(
    session: Session = Depends(get_session),
    current_user: UserModel = Depends(get_current_user),
) -> list[GoalModel]:
    statement = select(GoalModel).where(GoalModel.user_id == current_user.id)
    goals = list(session.exec(statement).all())
    for goal in goals:
        recalculate_goal_current_amount(session=session, user_id=current_user.id, goal_id=goal.id)
        session.refresh(goal)
    return goals


@router.post("", response_model=GoalResponse, status_code=status.HTTP_201_CREATED)
def create_goal(
    payload: GoalCreate,
    session: Session = Depends(get_session),
    current_user: UserModel = Depends(get_current_user),
) -> GoalModel:
    goal = GoalModel(
        user_id=current_user.id,
        name=payload.name,
        target_amount=payload.target_amount,
        current_amount=payload.current_amount,
        target_date=payload.target_date,
    )
    session.add(goal)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Goal already exists for this user")
    session.refresh(goal)
    return goal


@router.patch("/{goal_id}", response_model=GoalResponse)
def update_goal(
    goal_id: UUID,
    payload: GoalUpdate,
    session: Session = Depends(get_session),
    current_user: UserModel = Depends(get_current_user),
) -> GoalModel:
    goal = session.get(GoalModel, goal_id)
    if goal is None or goal.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found")

    values = payload.model_dump(exclude_unset=True)
    for field, value in values.items():
        setattr(goal, field, value)

    session.add(goal)
    session.commit()
    session.refresh(goal)
    return goal

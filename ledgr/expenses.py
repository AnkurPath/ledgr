from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func
from sqlmodel import Session, select

from ledgr.db import get_session
from ledgr.models import ExpenseModel
from ledgr.schemas import (
    DailyExpenseSummary,
    Expense,
    ExpenseCreate,
    ExpenseUpdate,
    cents_to_decimal,
    decimal_to_cents,
)


router = APIRouter(prefix="/expenses", tags=["expenses"])


def model_to_expense(expense: ExpenseModel) -> Expense:
    return Expense(
        id=expense.id,
        expense_date=expense.expense_date,
        description=expense.description,
        amount=cents_to_decimal(expense.amount_cents),
        category=expense.category,
        payment_method=expense.payment_method,
        notes=expense.notes,
        created_at=expense.created_at,
        updated_at=expense.updated_at,
    )


def fetch_expense_or_404(session: Session, expense_id: int) -> ExpenseModel:
    expense = session.get(ExpenseModel, expense_id)
    if expense is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found")
    return expense


@router.post("", response_model=Expense, status_code=status.HTTP_201_CREATED)
def create_expense(
    payload: ExpenseCreate,
    session: Session = Depends(get_session),
) -> Expense:
    expense = ExpenseModel(
        expense_date=payload.expense_date,
        description=payload.description,
        amount_cents=decimal_to_cents(payload.amount),
        category=payload.category,
        payment_method=payload.payment_method,
        notes=payload.notes,
    )
    session.add(expense)
    session.commit()
    session.refresh(expense)
    return model_to_expense(expense)


@router.get("", response_model=list[Expense])
def list_expenses(
    expense_date: Optional[date] = Query(default=None),
    from_date: Optional[date] = Query(default=None),
    to_date: Optional[date] = Query(default=None),
    category: Optional[str] = Query(default=None, min_length=1),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
) -> list[Expense]:
    statement = select(ExpenseModel)

    if expense_date is not None:
        statement = statement.where(ExpenseModel.expense_date == expense_date)
    if from_date is not None:
        statement = statement.where(ExpenseModel.expense_date >= from_date)
    if to_date is not None:
        statement = statement.where(ExpenseModel.expense_date <= to_date)
    if category is not None:
        statement = statement.where(ExpenseModel.category == category.strip())

    statement = statement.order_by(ExpenseModel.expense_date.desc(), ExpenseModel.id.desc())
    statement = statement.limit(limit).offset(offset)
    return [model_to_expense(expense) for expense in session.exec(statement).all()]


@router.get("/summary/daily", response_model=list[DailyExpenseSummary])
def daily_summary(
    from_date: Optional[date] = Query(default=None),
    to_date: Optional[date] = Query(default=None),
    session: Session = Depends(get_session),
) -> list[DailyExpenseSummary]:
    statement = select(
        ExpenseModel.expense_date,
        func.sum(ExpenseModel.amount_cents).label("total_cents"),
        func.count(ExpenseModel.id).label("expense_count"),
    )

    if from_date is not None:
        statement = statement.where(ExpenseModel.expense_date >= from_date)
    if to_date is not None:
        statement = statement.where(ExpenseModel.expense_date <= to_date)

    statement = statement.group_by(ExpenseModel.expense_date).order_by(ExpenseModel.expense_date.desc())
    return [
        DailyExpenseSummary(
            expense_date=row.expense_date,
            total_amount=cents_to_decimal(row.total_cents),
            expense_count=row.expense_count,
        )
        for row in session.exec(statement).all()
    ]


@router.get("/{expense_id}", response_model=Expense)
def get_expense(expense_id: int, session: Session = Depends(get_session)) -> Expense:
    return model_to_expense(fetch_expense_or_404(session, expense_id))


@router.put("/{expense_id}", response_model=Expense)
def replace_expense(
    expense_id: int,
    payload: ExpenseCreate,
    session: Session = Depends(get_session),
) -> Expense:
    expense = fetch_expense_or_404(session, expense_id)
    expense.expense_date = payload.expense_date
    expense.description = payload.description
    expense.amount_cents = decimal_to_cents(payload.amount)
    expense.category = payload.category
    expense.payment_method = payload.payment_method
    expense.notes = payload.notes
    session.commit()
    session.refresh(expense)
    return model_to_expense(expense)


@router.patch("/{expense_id}", response_model=Expense)
def update_expense(
    expense_id: int,
    payload: ExpenseUpdate,
    session: Session = Depends(get_session),
) -> Expense:
    expense = fetch_expense_or_404(session, expense_id)
    values = payload.model_dump(exclude_unset=True)

    if "amount" in values:
        expense.amount_cents = decimal_to_cents(values.pop("amount"))
    for field, value in values.items():
        setattr(expense, field, value)

    session.commit()
    session.refresh(expense)
    return model_to_expense(expense)


@router.delete("/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_expense(expense_id: int, session: Session = Depends(get_session)) -> Response:
    expense = fetch_expense_or_404(session, expense_id)
    session.delete(expense)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)

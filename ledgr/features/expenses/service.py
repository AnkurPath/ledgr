from fastapi import HTTPException, status
from sqlmodel import Session

from ledgr.features.expenses.models import ExpenseModel
from ledgr.features.expenses.schemas import Expense


def model_to_expense(expense: ExpenseModel) -> Expense:
    return Expense(
        id=expense.id,
        expense_date=expense.expense_date,
        description=expense.description,
        amount=expense.amount,
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

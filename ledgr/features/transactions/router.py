from decimal import Decimal
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from ledgr.core.db import get_session
from ledgr.core.security import get_current_user
from ledgr.features.investments.service import recalculate_goal_current_amount
from ledgr.features.users.models import AccountModel, CategoryModel, GoalModel
from ledgr.features.transactions.models import TransactionModel
from ledgr.features.transactions.schemas import (
    TransactionCreate,
    TransactionCreateResponse,
    TransactionUpdate,
    TransactionResponse,
    TransactionTypeEnum,
)


router = APIRouter(prefix="/transactions", tags=["transactions"])

ACCOUNT_TRANSFER_CATEGORY_NAMES = {"A/C Transfer", "Cash Withdrawal", "Business"}
# Holdings tracked in Investment tabs — record balances without debiting cash/bank accounts.
PORTFOLIO_INVESTMENT_CATEGORY_NAMES = {
    "EPF/PPF/NPS",
    "Provident Fund",
    "Fixed Deposit",
    "Real Estate",
}
TRANSACTION_KIND_MAP = {
    TransactionTypeEnum.INCOME: "income",
    TransactionTypeEnum.EXPENSE: "expense",
    TransactionTypeEnum.TRANSFER: "transfer",
    TransactionTypeEnum.INVESTMENT: "investment",
    TransactionTypeEnum.REFUND: "refund",
}

@router.get("", response_model=list[TransactionResponse])
def list_transactions(
    session: Session = Depends(get_session),
    current_user: dict = Depends(get_current_user)
) -> list[TransactionModel]:
    user_id = current_user.id
    statement = select(TransactionModel).where(TransactionModel.user_id == user_id).order_by(TransactionModel.date.desc())
    return list(session.exec(statement).all())


def get_owned_account(session: Session, account_id: UUID, user_id: UUID, label: str = "Account") -> AccountModel:
    account = session.get(AccountModel, account_id)
    if not account or account.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{label} not found or not authorized",
        )
    return account


def get_available_category(session: Session, category_id: Optional[UUID], user_id: UUID) -> Optional[CategoryModel]:
    if category_id is None:
        return None

    category = session.get(CategoryModel, category_id)
    if not category or (category.user_id != user_id and not category.is_global):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Category not found or not authorized",
        )
    return category


def should_move_between_accounts(category: Optional[CategoryModel]) -> bool:
    return (
        category is not None
        and category.kind == "transfer"
        and category.name in ACCOUNT_TRANSFER_CATEGORY_NAMES
    )


def validate_category_kind(category: Optional[CategoryModel], transaction_type: TransactionTypeEnum) -> None:
    if category is None:
        return
    if transaction_type == TransactionTypeEnum.REFUND:
        if category.kind not in {"refund", "expense"}:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Selected category kind must be 'expense' or 'refund' for REFUND transactions",
            )
        return
    expected_kind = TRANSACTION_KIND_MAP[transaction_type]
    if category.kind != expected_kind:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Selected category kind must be '{expected_kind}' for {transaction_type.value} transactions",
        )


def is_portfolio_investment_category(category: Optional[CategoryModel]) -> bool:
    return category is not None and category.name in PORTFOLIO_INVESTMENT_CATEGORY_NAMES


def account_balance_impact(
    transaction_type: TransactionTypeEnum,
    amount: Decimal,
    *,
    category: Optional[CategoryModel] = None,
) -> Decimal:
    if transaction_type in {TransactionTypeEnum.INCOME, TransactionTypeEnum.REFUND}:
        return amount
    if transaction_type == TransactionTypeEnum.EXPENSE:
        return -amount
    if transaction_type == TransactionTypeEnum.INVESTMENT:
        if is_portfolio_investment_category(category):
            return Decimal("0.00")
        return -amount
    return Decimal("0.00")


def build_transaction(
    *,
    payload: TransactionCreate,
    user_id: UUID,
    account_id: UUID,
    amount: Decimal,
    merchant: Optional[str] = None,
) -> TransactionModel:
    return TransactionModel(
        user_id=user_id,
        date=payload.date,
        merchant=merchant if merchant is not None else payload.merchant,
        product=payload.product,
        amount=amount,
        account_id=account_id,
        transaction_type=payload.transaction_type.value,
        category_id=payload.category_id,
        tag_id=payload.tag_id,
        goal_id=payload.goal_id,
        notes=payload.notes,
        bills=payload.bills,
    )


@router.post("", response_model=TransactionCreateResponse)
def create_transaction(
    payload: TransactionCreate,
    session: Session = Depends(get_session),
    current_user: dict = Depends(get_current_user)
) -> TransactionCreateResponse:
    user_id = current_user.id
    category = get_available_category(session, payload.category_id, user_id)
    validate_category_kind(category, payload.transaction_type)

    if payload.transaction_type == TransactionTypeEnum.TRANSFER and should_move_between_accounts(category):
        if payload.source_account_id is None or payload.destination_account_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="source_account_id and destination_account_id are required for this transfer category",
            )

        source_account = get_owned_account(session, payload.source_account_id, user_id, "Source account")
        destination_account = get_owned_account(session, payload.destination_account_id, user_id, "Destination account")

        if source_account.id == destination_account.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot transfer money to the same account",
            )

        if source_account.current_balance < payload.amount:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Insufficient funds in the source account",
            )

        source_account.current_balance -= payload.amount
        destination_account.current_balance += payload.amount

        outbound_transaction = build_transaction(
            payload=payload,
            user_id=user_id,
            account_id=source_account.id,
            amount=-payload.amount,
            merchant=f"Transfer to {destination_account.name}",
        )
        inbound_transaction = build_transaction(
            payload=payload,
            user_id=user_id,
            account_id=destination_account.id,
            amount=payload.amount,
            merchant=f"Transfer from {source_account.name}",
        )

        session.add(source_account)
        session.add(destination_account)
        session.add(outbound_transaction)
        session.add(inbound_transaction)
        session.commit()
        session.refresh(outbound_transaction)
        session.refresh(inbound_transaction)

        return TransactionCreateResponse(
            message="Transfer successful",
            transactions=[outbound_transaction, inbound_transaction],
            amount_transferred=payload.amount,
        )

    if payload.account_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="account_id is required for this transaction category",
        )

    account = get_owned_account(session, payload.account_id, user_id)

    if payload.goal_id is not None:
        goal = session.get(GoalModel, payload.goal_id)
        if goal is None or goal.user_id != user_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found")

    account_changed = False
    if payload.transaction_type == TransactionTypeEnum.EXPENSE:
        if account.current_balance < payload.amount:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, 
                detail="Insufficient funds in the selected account"
            )
        account.current_balance -= payload.amount
        account_changed = True
        message = "Expense transaction created"
    elif payload.transaction_type == TransactionTypeEnum.INVESTMENT:
        if is_portfolio_investment_category(category):
            # EPF/PPF/NPS and similar holdings are recorded as portfolio data, not cash outflows.
            message = "Investment holding recorded"
        else:
            if account.current_balance < payload.amount:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Insufficient funds in the selected account",
                )
            account.current_balance -= payload.amount
            account_changed = True
            message = "Investment transaction created"
    elif payload.transaction_type == TransactionTypeEnum.INCOME:
        account.current_balance += payload.amount
        account_changed = True
        message = "Income transaction created"
    elif payload.transaction_type == TransactionTypeEnum.REFUND:
        account.current_balance += payload.amount
        account_changed = True
        message = "Refund transaction created"
    elif payload.transaction_type == TransactionTypeEnum.TRANSFER:
        if account.current_balance < payload.amount:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Insufficient funds in the selected account",
            )
        account.current_balance -= payload.amount
        account_changed = True
        message = "Transfer transaction created"
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported transaction type")

    if account_changed:
        session.add(account)
    transaction = build_transaction(
        payload=payload,
        user_id=user_id,
        amount=-payload.amount if payload.transaction_type == TransactionTypeEnum.TRANSFER else payload.amount,
        account_id=payload.account_id,
    )
    session.add(transaction)
    session.commit()
    session.refresh(transaction)

    if payload.transaction_type == TransactionTypeEnum.INVESTMENT and payload.goal_id is not None:
        recalculate_goal_current_amount(session=session, user_id=user_id, goal_id=payload.goal_id)

    return TransactionCreateResponse(message=message, transactions=[transaction])


@router.patch("/{transaction_id}", response_model=TransactionResponse)
def update_transaction(
    transaction_id: UUID,
    payload: TransactionUpdate,
    session: Session = Depends(get_session),
    current_user: dict = Depends(get_current_user),
) -> TransactionModel:
    user_id = current_user.id
    transaction = session.get(TransactionModel, transaction_id)
    if not transaction or transaction.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found")

    current_type = TransactionTypeEnum(transaction.transaction_type)
    next_type = payload.transaction_type or current_type
    if current_type == TransactionTypeEnum.TRANSFER or next_type == TransactionTypeEnum.TRANSFER:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Editing TRANSFER transactions is not supported",
        )

    old_account = get_owned_account(session, transaction.account_id, user_id)
    next_account = old_account
    if payload.account_id is not None and payload.account_id != old_account.id:
        next_account = get_owned_account(session, payload.account_id, user_id)

    next_amount = payload.amount if payload.amount is not None else transaction.amount
    category_field_updated = "category_id" in payload.model_fields_set
    next_category = get_available_category(session, payload.category_id, user_id) if payload.category_id else None
    current_category = (
        get_available_category(session, transaction.category_id, user_id)
        if transaction.category_id is not None
        else None
    )
    if category_field_updated and payload.category_id is not None:
        validate_category_kind(next_category, next_type)
    elif not category_field_updated and current_category is not None:
        validate_category_kind(current_category, next_type)
        next_category = current_category

    old_impact = account_balance_impact(current_type, transaction.amount, category=current_category)
    next_impact = account_balance_impact(next_type, next_amount, category=next_category)

    if old_account.id == next_account.id:
        projected_balance = old_account.current_balance - old_impact + next_impact
        if projected_balance < 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Insufficient funds in the selected account",
            )
        old_account.current_balance = projected_balance
        session.add(old_account)
    else:
        projected_old_balance = old_account.current_balance - old_impact
        projected_next_balance = next_account.current_balance + next_impact
        if projected_old_balance < 0 or projected_next_balance < 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Insufficient funds in the selected account",
            )
        old_account.current_balance = projected_old_balance
        next_account.current_balance = projected_next_balance
        session.add(old_account)
        session.add(next_account)

    previous_goal_id = transaction.goal_id
    if "goal_id" in payload.model_fields_set and payload.goal_id is not None:
        goal = session.get(GoalModel, payload.goal_id)
        if goal is None or goal.user_id != user_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found")

    values = payload.model_dump(exclude_unset=True)
    if "transaction_type" in values:
        values["transaction_type"] = values["transaction_type"].value
    for field, value in values.items():
        setattr(transaction, field, value)

    session.add(transaction)
    session.commit()
    session.refresh(transaction)

    if TransactionTypeEnum(transaction.transaction_type) == TransactionTypeEnum.INVESTMENT:
        recalculate_goal_current_amount(session=session, user_id=user_id, goal_id=transaction.goal_id)
        if previous_goal_id is not None and previous_goal_id != transaction.goal_id:
            recalculate_goal_current_amount(session=session, user_id=user_id, goal_id=previous_goal_id)

    return transaction


@router.delete("/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_transaction(
    transaction_id: UUID,
    session: Session = Depends(get_session),
    current_user: dict = Depends(get_current_user),
) -> None:
    user_id = current_user.id
    transaction = session.get(TransactionModel, transaction_id)
    if not transaction or transaction.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found")

    if TransactionTypeEnum(transaction.transaction_type) == TransactionTypeEnum.TRANSFER:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Deleting TRANSFER transactions is not supported",
        )

    category = (
        get_available_category(session, transaction.category_id, user_id)
        if transaction.category_id is not None
        else None
    )
    impact = account_balance_impact(
        TransactionTypeEnum(transaction.transaction_type),
        transaction.amount,
        category=category,
    )
    if impact != 0:
        account = get_owned_account(session, transaction.account_id, user_id)
        projected_balance = account.current_balance - impact
        if projected_balance < 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Unable to delete transaction because account balance would become negative",
            )
        account.current_balance = projected_balance
        session.add(account)

    goal_id = transaction.goal_id
    transaction_type = TransactionTypeEnum(transaction.transaction_type)
    session.delete(transaction)
    session.commit()

    if transaction_type == TransactionTypeEnum.INVESTMENT:
        recalculate_goal_current_amount(session=session, user_id=user_id, goal_id=goal_id)

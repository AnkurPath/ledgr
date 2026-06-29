from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from ledgr.core.db import get_session
from ledgr.core.security import get_current_user
from ledgr.features.users.models import AccountModel, CategoryModel
from ledgr.features.transactions.models import TransactionModel
from ledgr.features.transactions.schemas import (
    TransactionCreate,
    TransactionCreateResponse,
    TransactionResponse,
    TransactionTypeEnum,
)


router = APIRouter(prefix="/transactions", tags=["transactions"])

ACCOUNT_TRANSFER_CATEGORY_NAMES = {"A/C Transfer", "Cash Withdrawal", "Business"}

@router.get("", response_model=list[TransactionResponse])
def list_transactions(
    session: Session = Depends(get_session),
    current_user: dict = Depends(get_current_user)
) -> list[TransactionModel]:
    user_id = current_user.id
    statement = select(TransactionModel).where(TransactionModel.user_id == user_id).order_by(TransactionModel.date.desc())
    return list(session.exec(statement).all())


def get_owned_account(session: Session, account_id: int, user_id: int, label: str = "Account") -> AccountModel:
    account = session.get(AccountModel, account_id)
    if not account or account.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{label} not found or not authorized",
        )
    return account


def get_available_category(session: Session, category_id: Optional[int], user_id: int) -> Optional[CategoryModel]:
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


def build_transaction(
    *,
    payload: TransactionCreate,
    user_id: int,
    account_id: int,
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

    if payload.transaction_type == TransactionTypeEnum.EXPENSE:
        if account.current_balance < payload.amount:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, 
                detail="Insufficient funds in the selected account"
            )
        account.current_balance -= payload.amount
        message = "Expense transaction created"
    elif payload.transaction_type == TransactionTypeEnum.INCOME:
        account.current_balance += payload.amount
        message = "Income transaction created"
    elif payload.transaction_type == TransactionTypeEnum.TRANSFER:
        message = "Transfer transaction created"
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported transaction type")

    if payload.transaction_type in {TransactionTypeEnum.INCOME, TransactionTypeEnum.EXPENSE}:
        session.add(account)
    transaction = build_transaction(
        payload=payload,
        user_id=user_id,
        amount=payload.amount,
        account_id=payload.account_id,
    )
    session.add(transaction)
    session.commit()
    session.refresh(transaction)

    return TransactionCreateResponse(message=message, transactions=[transaction])

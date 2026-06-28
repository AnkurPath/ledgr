from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends , HTTPException, status
from sqlmodel import Session, select

from ledgr.core.db import get_session
from ledgr.core.security import get_current_user
from ledgr.features.users.models import AccountModel
from ledgr.features.transactions.models import TransactionModel
from ledgr.features.transactions.schemas import (TransactionResponse, TransactionCreate, TransactionTypeEnum)

from ledgr.core.security import get_current_user    


router = APIRouter(prefix="/transactions", tags=["transactions"])

@router.get("", response_model=list[TransactionResponse])
def list_transactions(
    session: Session = Depends(get_session),
    current_user: dict = Depends(get_current_user)
) -> list[TransactionModel]:
    user_id = current_user.id
    statement = select(TransactionModel).where(TransactionModel.user_id == user_id)
    return list(session.exec(statement).all())

@router.post("", response_model=TransactionResponse)
def create_transaction(
    payload: TransactionCreate,
    session: Session = Depends(get_session),
    current_user: dict = Depends(get_current_user)
) -> TransactionModel:
    user_id = current_user.id
    
    # 1. Fetch the account and verify ownership
    account = session.get(AccountModel, payload.account_id)
    if not account or account.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="Account not found or not authorized"
        )

    # 2. Check balance and 3. Update account balance
    # (Assuming transaction_type is an Enum where 'EXPENSE' means money leaving)
    if payload.transaction_type.value.upper() == "EXPENSE":
        if account.current_balance < payload.amount:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, 
                detail="Insufficient funds in the selected account"
            )
        # Deduct the amount
        account.current_balance -= payload.amount
        
    elif payload.transaction_type.value.upper() == "INCOME":
        # Add the amount
        account.current_balance += payload.amount

    # Stage the account update in the database session
    session.add(account)

    # Proceed with creating the transaction
    transaction = TransactionModel(
        user_id=user_id,
        date=payload.date,
        merchant=payload.merchant,
        product=payload.product,
        amount=payload.amount,
        account_id=payload.account_id,
        transaction_type=payload.transaction_type.value,
        category_id=payload.category_id,
        tag_id=payload.tag_id,
        goal_id=payload.goal_id,
        notes=payload.notes,
        bills=payload.bills
    )
    
    session.add(transaction)
    
    # Commit both the new transaction and the account balance update simultaneously
    session.commit()
    session.refresh(transaction)
    
    return transaction

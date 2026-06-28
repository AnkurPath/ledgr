from enum import Enum
from decimal import Decimal
from typing import Optional
from datetime import datetime

from pydantic import BaseModel, Field

class TransactionTypeEnum(str, Enum):
    INCOME = "INCOME"
    EXPENSE = "EXPENSE"
    TRANSFER = "TRANSFER"

class TransactionCreate(BaseModel):
    date: datetime
    merchant: Optional[str] = None
    product: Optional[str] = None
    amount: Decimal
    account_id: int
    transaction_type: TransactionTypeEnum
    category_id: Optional[int] = None
    tag_id: Optional[int] = None
    goal_id: Optional[int] = None   
    notes: Optional[str] = None
    bills: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

class TransactionResponse(BaseModel):
    id: int
    user_id: int
    date: datetime
    merchant: Optional[str] = None
    product: Optional[str] = None
    amount: Decimal
    account_id: int
    transaction_type: TransactionTypeEnum
    category_id: Optional[int] = None
    tag_id: Optional[int] = None
    goal_id: Optional[int] = None   
    notes: Optional[str] = None
    bills: Optional[str] = None
    created_at: datetime
    updated_at: datetime
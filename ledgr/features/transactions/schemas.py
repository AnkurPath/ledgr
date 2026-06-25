from enum import Enum
from decimal import Decimal
from typing import Optional
from datetime import datetime

from pydantic import BaseModel, Field



class Transaction(BaseModel):
    id: int
    user_id: int
    account_id: int
    amount: Decimal
    currency: str
    description: Optional[str] = None
    transaction_type: str
    created_at: datetime
    updated_at: datetime
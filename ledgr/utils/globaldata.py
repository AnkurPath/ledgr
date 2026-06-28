from sqlmodel import Session, select

from ledgr.features.users.models import CategoryModel

DEFAULT_CATEGORIES = [
    # INCOME
    {"category": "income", "name": "Salary"},
    {"category": "income", "name": "Interest"},
    {"category": "income", "name": "Dividend"},
    {"category": "income", "name": "Credit"},
    {"category": "income", "name": "Loan"},
    {"category": "income", "name": "Cashback"},
    {"category": "income", "name": "Other"},
    
    # EXPENSE
    {"category": "expense", "name": "Bills & Utility"},
    {"category": "expense", "name": "EMI"},
    {"category": "expense", "name": "Education"},
    {"category": "expense", "name": "Food & Drinks"},
    {"category": "expense", "name": "Fuel"},
    {"category": "expense", "name": "Groceries"},
    {"category": "expense", "name": "Health"},
    {"category": "expense", "name": "Shopping"},
    {"category": "expense", "name": "Transportation"},
    {"category": "expense", "name": "Travel"},
    {"category": "expense", "name": "Rent"},
    {"category": "expense", "name": "Insurance"},
    {"category": "expense", "name": "Entertainment"},
    {"category": "expense", "name": "Subscriptions"},
    {"category": "expense", "name": "Mess"},
    {"category": "expense", "name": "Personal"},
    
    # TRANSFER (Combines your Non-Income / Non-Expense)
    {"category": "transfer", "name": "A/C Transfer"},
    {"category": "transfer", "name": "Credit Card"},
    {"category": "transfer", "name": "Business"},
    {"category": "transfer", "name": "Investments"},
    {"category": "transfer", "name": "Cash Transfer"},
    {"category": "transfer", "name": "Refund"},
    {"category": "transfer", "name": "Return"},
]

def seed_global_categories(session: Session):
    """Run this once on application startup or via CLI"""
    
    # Check if they already exist to prevent duplicates on server restarts
    existing = session.exec(select(CategoryModel).where(CategoryModel.is_global == True)).first()
    if existing:
        print("Global categories already seeded.")
        return

    for cat_data in DEFAULT_CATEGORIES:
        category = CategoryModel(
            user_id=None,          # It doesn't belong to any specific user
            is_global=True,        # Mark it as a system category
            kind=cat_data["category"],
            name=cat_data["name"]
        )
        session.add(category)
    
    session.commit()
    print("Successfully seeded global categories.")

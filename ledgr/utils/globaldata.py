from sqlmodel import Session, select
from ledgr.features.users.models import CategoryModel, TagModel

DEFAULT_CATEGORIES = [
    # INCOME
    {"category": "income", "name": "Salary"},
    {"category": "income", "name": "Bonus"},
    {"category": "income", "name": "Interest"},
    {"category": "income", "name": "Dividend"},
    {"category": "income", "name": "Credit"},
    {"category": "income", "name": "Loan"},
    {"category": "income", "name": "Cashback"},
    {"category": "income", "name": "Rental Income"},
    {"category": "income", "name": "Freelance"},
    {"category": "income", "name": "Other"},
    
    # EXPENSE
    {"category": "expense", "name": "Bills & Utility"},
    {"category": "expense", "name": "EMI"},
    {"category": "expense", "name": "Education"},
    {"category": "expense", "name": "Food & Drinks"},
    {"category": "expense", "name": "Dining Out"},
    {"category": "expense", "name": "Fuel"},
    {"category": "expense", "name": "Groceries"},
    {"category": "expense", "name": "Health"},
    {"category": "expense", "name": "Shopping"},
    {"category": "expense", "name": "Transportation"},
    {"category": "expense", "name": "Travel"},
    {"category": "expense", "name": "Rent"},
    {"category": "expense", "name": "Home Maintenance"},
    {"category": "expense", "name": "Insurance"},
    {"category": "expense", "name": "Entertainment"},
    {"category": "expense", "name": "Subscriptions"},
    {"category": "expense", "name": "Mess"},
    {"category": "expense", "name": "Pets"},
    {"category": "expense", "name": "Taxes"},
    {"category": "expense", "name": "Childcare"},
    {"category": "expense", "name": "Personal"},
    {"category": "expense", "name": "Others"},
    
    # TRANSFER
    {"category": "transfer", "name": "A/C Transfer"},
    {"category": "transfer", "name": "Credit Card"},
    {"category": "transfer", "name": "Cash Withdrawal"},
    {"category": "transfer", "name": "Business"},

    
    # INVESTMENT 
    {"category": "investment", "name": "Mutual Funds"},
    {"category": "investment", "name": "Stocks"},
    {"category": "investment", "name": "International Investment"},
    {"category": "investment", "name": "Fixed Deposit"},
    {"category": "investment", "name": "Real Estate"},
    {"category": "investment", "name": "Crypto"},
    {"category": "investment", "name": "Provident Fund"},
    
    # REFUND
    {"category": "refund", "name": "Split Payback"},
    {"category": "refund", "name": "Tax Refund"},
    {"category": "refund", "name": "Product Return"},
    {"category": "refund", "name": "Deposit Return"},
]

DEFAULT_TAGS = [
    {"name": "Cash", "color": "#85BB65"},
    {"name": "Family", "color": "#FFB6C1"},
    {"name": "Education", "color": "#87CEEB"},
    {"name": "Friends", "color": "#FFD700"},
    {"name": "Office", "color": "#778899"},
    {"name": "Self", "color": "#9370DB"},
    {"name": "Needs", "color": "#FF6347"},
    {"name": "Wants", "color": "#FFA07A"},
    {"name": "Investments", "color": "#4682B4"},
]


def seed_global_categories(session: Session):
    existing = session.exec(select(CategoryModel).where(CategoryModel.is_global == True)).first()
    if existing:
        print("Global categories already seeded.")
        return

    for cat_data in DEFAULT_CATEGORIES:
        category = CategoryModel(
            user_id=None,          
            is_global=True,        
            kind=cat_data["category"],  # Corrected from 'kind' to 'category'
            name=cat_data["name"]
        )
        session.add(category)
    
    session.commit()
    print("Successfully seeded global categories.")


def seed_global_tags(session: Session):
    existing = session.exec(select(TagModel).where(TagModel.is_global == True)).first()
    if existing:
        print("Global tags already seeded.")
        return

    for tag_data in DEFAULT_TAGS:
        tag = TagModel(
            user_id=None,
            is_global=True,
            name=tag_data["name"],
            color=tag_data["color"]
        )
        session.add(tag)
    
    session.commit()
    print("Successfully seeded global tags.")


def seed_all_globals(session: Session):
    """Run this single function to seed everything."""
    seed_global_categories(session)
    seed_global_tags(session)


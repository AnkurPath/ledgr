from sqlmodel import Session, select

from sqlalchemy.dialects.postgresql import insert as pg_insert
from ledgr.features.users.models import CategoryModel, TagModel
from ledgr.features.investments.models import MutualFundDataModel
from ledgr.utils.mfdata import (
    AMFI_NAV_ALL_URL,
    fetch_amfi_navall_text,
    parse_amfi_navall_text,
)

MF_BULK_INSERT_CHUNK_SIZE = 2000

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

def seed_mf_data(session: Session):
    url = AMFI_NAV_ALL_URL
    existing = session.exec(select(MutualFundDataModel.scheme_code).limit(1)).first()
    if existing is not None:
        print("MF data already seeded.")
        return

    try:
        raw_text = fetch_amfi_navall_text(timeout=60, source_url=url)
        rows, failed_rows = parse_amfi_navall_text(raw_text)

        if not rows:
            print("No valid MF rows to seed.")
            return

        bind = session.get_bind()
        if bind is not None and bind.dialect.name == "postgresql":
            inserted_rows = 0
            for i in range(0, len(rows), MF_BULK_INSERT_CHUNK_SIZE):
                chunk = rows[i : i + MF_BULK_INSERT_CHUNK_SIZE]
                stmt = pg_insert(MutualFundDataModel).values(chunk)
                stmt = stmt.on_conflict_do_nothing(index_elements=["scheme_code"])
                session.execute(stmt)
                inserted_rows += len(chunk)
            print(f"Inserted MF rows in chunks ({inserted_rows} attempted).")
        else:
            existing_codes = set(session.exec(select(MutualFundDataModel.scheme_code)).all())
            new_rows = [row for row in rows if row["scheme_code"] not in existing_codes]
            if new_rows:
                for i in range(0, len(new_rows), MF_BULK_INSERT_CHUNK_SIZE):
                    chunk = new_rows[i : i + MF_BULK_INSERT_CHUNK_SIZE]
                    session.bulk_insert_mappings(MutualFundDataModel, chunk)

        session.commit()
        print(f"Successfully seeded MF data from NAVAll ({len(rows)} rows processed, failed_rows={failed_rows}).")
    except Exception as e:
        print(f"Error fetching MF data: {e}")
        session.rollback()

def seed_all_globals(session: Session):
    """Run this single function to seed everything."""
    seed_global_categories(session)
    seed_global_tags(session)
    seed_mf_data(session)


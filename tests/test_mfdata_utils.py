import os
from decimal import Decimal

os.environ["LEDGR_DATABASE_URL"] = "sqlite://"

from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, Session, create_engine, select

import ledgr.models  # noqa: F401
from ledgr.features.investments.models import MutualFundDataModel
from ledgr.utils import mfdata


SAMPLE_NAVALL_TEXT = """
Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Net Asset Value;Date

Open Ended Schemes(Debt Scheme - Banking and PSU Fund)

Axis Mutual Fund

120438;INF846K01CR6;-;Axis Banking & PSU Debt Fund - Direct Plan - Growth Option;2887.5171;03-Jul-2026
120439;INF846K01CT2;INF846K01CS4;Axis Banking & PSU Debt Fund - Direct Plan - Monthly IDCW;1037.3474;03-Jul-2026
bad-line-without-enough-columns
"""


def _make_engine():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(bind=engine)
    return engine


def test_parse_amfi_navall_text_extracts_mutual_fund_rows() -> None:
    rows, failed_rows = mfdata.parse_amfi_navall_text(SAMPLE_NAVALL_TEXT)

    assert len(rows) == 2
    assert failed_rows == 0
    assert rows[0]["scheme_code"] == 120438
    assert rows[0]["fund_house"] == "Axis Mutual Fund"
    assert rows[0]["scheme_type"] == "Open Ended Schemes"
    assert rows[0]["scheme_category"] == "Debt Scheme - Banking and PSU Fund"
    assert rows[0]["nav"] == Decimal("2887.517")
    assert rows[0]["date"].isoformat() == "2026-07-03"
    assert rows[0]["isin_div_reinvestment"] is None


def test_refresh_mutual_fund_nav_inserts_and_updates_rows() -> None:
    engine = _make_engine()

    initial_payload = SAMPLE_NAVALL_TEXT
    updated_payload = SAMPLE_NAVALL_TEXT.replace("2887.5171", "2999.1234")

    original_fetch = mfdata.fetch_amfi_navall_text
    try:
        mfdata.fetch_amfi_navall_text = lambda **kwargs: initial_payload
        with Session(engine) as session:
            stats = mfdata.refresh_mutual_fund_nav(session)
            assert stats["fetched"] == 2
            assert stats["inserted"] == 2
            assert stats["updated"] == 0
            assert stats["failed"] == 0

        mfdata.fetch_amfi_navall_text = lambda **kwargs: updated_payload
        with Session(engine) as session:
            stats = mfdata.refresh_mutual_fund_nav(session)
            assert stats["fetched"] == 2
            assert stats["inserted"] == 0
            assert stats["updated"] == 1
            axis_growth = session.exec(
                select(MutualFundDataModel).where(MutualFundDataModel.scheme_code == 120438)
            ).one()
            assert axis_growth.nav == Decimal("2999.123")
    finally:
        mfdata.fetch_amfi_navall_text = original_fetch

from __future__ import annotations

from datetime import datetime
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any
import urllib.request

from sqlmodel import Session, select

from ledgr.features.investments.models import MutualFundDataModel

AMFI_NAV_ALL_URL = "https://portal.amfiindia.com/spages/NAVAll.txt"
AMFI_NAV_DATE_FORMAT = "%d-%b-%Y"
MF_SCHEME_NAME_MAX_LEN = 160
NAV_REFRESH_COMMIT_EVERY = 1000
NAV_DECIMAL_PLACES = Decimal("0.001")


def _safe_decimal(value: str | None) -> Decimal | None:
    if value is None:
        return None
    try:
        return Decimal(value)
    except (InvalidOperation, TypeError):
        return None


def _safe_nav_date(value: str | None):
    if not value:
        return None
    try:
        return datetime.strptime(value, AMFI_NAV_DATE_FORMAT).date()
    except ValueError:
        return None


def fetch_amfi_navall_text(*, timeout: int = 60, source_url: str = AMFI_NAV_ALL_URL) -> str:
    url = source_url
    with urllib.request.urlopen(url, timeout=timeout) as response:
        return response.read().decode("utf-8", errors="replace")


def parse_amfi_navall_text(raw_text: str) -> tuple[list[dict[str, Any]], int]:
    rows: list[dict[str, Any]] = []
    failed_rows = 0
    current_fund_house: str | None = None
    current_scheme_type: str | None = None
    current_scheme_category: str | None = None

    for raw_line in raw_text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if line.startswith("Source URL:") or line.startswith("Title:"):
            continue
        if line.startswith("Scheme Code;"):
            continue

        if ";" not in line:
            if line.endswith("Mutual Fund"):
                current_fund_house = line
                continue
            if "Schemes(" in line and line.endswith(")"):
                open_paren = line.find("(")
                close_paren = line.rfind(")")
                current_scheme_type = line[:open_paren].strip()
                current_scheme_category = line[open_paren + 1 : close_paren].strip()
                continue
            continue

        parts = [part.strip() for part in line.split(";")]
        if len(parts) != 6:
            failed_rows += 1
            continue

        scheme_code_raw, isin_growth_raw, isin_div_reinvestment_raw, scheme_name_raw, nav_raw, date_raw = parts
        if not scheme_code_raw.isdigit():
            failed_rows += 1
            continue

        nav = _safe_decimal(nav_raw)
        date = _safe_nav_date(date_raw)
        if nav is None or date is None:
            failed_rows += 1
            continue
        nav = nav.quantize(NAV_DECIMAL_PLACES, rounding=ROUND_HALF_UP)

        scheme_name = scheme_name_raw[:MF_SCHEME_NAME_MAX_LEN]
        rows.append(
            {
                "scheme_code": int(scheme_code_raw),
                "isin_growth": None if isin_growth_raw in {"", "-"} else isin_growth_raw,
                "isin_div_reinvestment": None
                if isin_div_reinvestment_raw in {"", "-"}
                else isin_div_reinvestment_raw,
                "scheme_name": scheme_name,
                "fund_house": current_fund_house,
                "scheme_type": current_scheme_type,
                "scheme_category": current_scheme_category,
                "nav": nav,
                "date": date,
            }
        )

    return rows, failed_rows


def refresh_mutual_fund_nav(
    session: Session,
    *,
    limit: int | None = None,
    timeout: int = 60,
    source_url: str = AMFI_NAV_ALL_URL,
) -> dict[str, int]:
    raw_text = fetch_amfi_navall_text(timeout=timeout, source_url=source_url)
    parsed_rows, failed_rows = parse_amfi_navall_text(raw_text)
    if limit is not None:
        parsed_rows = parsed_rows[:limit]

    stats = {
        "fetched": len(parsed_rows),
        "updated": 0,
        "inserted": 0,
        "skipped": 0,
        "failed": failed_rows,
        "processed": 0,
    }

    existing_by_code = {
        model.scheme_code: model
        for model in session.exec(select(MutualFundDataModel)).all()
    }

    for row in parsed_rows:
        existing = existing_by_code.get(row["scheme_code"])
        if existing is None:
            session.add(MutualFundDataModel(**row))
            stats["inserted"] += 1
            stats["processed"] += 1
            continue

        changed = False
        for field in (
            "scheme_name",
            "isin_growth",
            "isin_div_reinvestment",
            "fund_house",
            "scheme_type",
            "scheme_category",
            "nav",
            "date",
        ):
            new_value = row[field]
            if getattr(existing, field) != new_value:
                setattr(existing, field, new_value)
                changed = True

        if changed:
            session.add(existing)
            stats["updated"] += 1
        else:
            stats["skipped"] += 1

        stats["processed"] += 1
        if stats["processed"] % NAV_REFRESH_COMMIT_EVERY == 0:
            session.commit()
            print(
                "NAVAll refresh progress: "
                f"processed={stats['processed']} inserted={stats['inserted']} "
                f"updated={stats['updated']} failed={stats['failed']}"
            )

    session.commit()
    return stats

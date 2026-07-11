from __future__ import annotations

import argparse
from pathlib import Path
import sys

from sqlmodel import Session

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from ledgr.core.db import engine
from ledgr.utils.mfdata import AMFI_NAV_ALL_URL, refresh_mutual_fund_nav


def main() -> None:
    parser = argparse.ArgumentParser(description="Refresh latest NAV data for mutual funds")
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Refresh only first N schemes (useful for smoke tests)",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=60,
        help="Per-request timeout in seconds",
    )
    parser.add_argument(
        "--source-url",
        type=str,
        default=AMFI_NAV_ALL_URL,
        help="AMFI NAVAll endpoint URL",
    )
    args = parser.parse_args()

    with Session(engine) as session:
        stats = refresh_mutual_fund_nav(
            session,
            limit=args.limit,
            timeout=args.timeout,
            source_url=args.source_url,
        )

    print(
        "Mutual fund NAV refresh complete: "
        f"fetched={stats['fetched']} "
        f"inserted={stats['inserted']} "
        f"updated={stats['updated']} "
        f"skipped={stats['skipped']} "
        f"failed={stats['failed']}"
    )


if __name__ == "__main__":
    main()

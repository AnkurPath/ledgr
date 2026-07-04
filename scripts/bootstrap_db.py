from __future__ import annotations

from pathlib import Path
import subprocess
import sys

from sqlmodel import SQLModel

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from ledgr.core.db import engine
import ledgr.models  # noqa: F401


def _has_migration_files() -> bool:
    versions_dir = Path("migrations/versions")
    if not versions_dir.exists():
        return False
    return any(path.suffix == ".py" and path.name != "__init__.py" for path in versions_dir.iterdir())


def main() -> None:
    if _has_migration_files():
        print("Migration files found. Running alembic upgrade head...")
        subprocess.run(["uv", "run", "alembic", "upgrade", "head"], check=True)
        return

    print("No migration files found. Creating schema from SQLModel metadata...")
    SQLModel.metadata.create_all(engine)
    print("Schema creation complete.")


if __name__ == "__main__":
    main()

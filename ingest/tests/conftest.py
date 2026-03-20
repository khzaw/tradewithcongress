from __future__ import annotations

import psycopg
import pytest

from ingest.config import Settings
from ingest.db import connect
from ingest.migrate import (
    MIGRATIONS_DIR,
    apply_migration,
    applied_versions,
    ensure_migrations_table,
)


@pytest.fixture(scope="session")
def settings() -> Settings:
    return Settings()


@pytest.fixture(scope="session", autouse=True)
def migrated_database(settings: Settings) -> None:
    with connect(settings) as conn:
        ensure_migrations_table(conn)
        done = applied_versions(conn)
        for migration_path in sorted(MIGRATIONS_DIR.glob("*.sql")):
            if migration_path.name in done:
                continue
            apply_migration(
                conn,
                migration_path.name,
                migration_path.read_text(encoding="utf-8"),
            )


@pytest.fixture
def db_conn(settings: Settings) -> psycopg.Connection:
    with connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                TRUNCATE TABLE
                    parse_issues,
                    parse_runs,
                    position_events,
                    positions,
                    transactions,
                    filing_documents,
                    filings,
                    official_aliases,
                    officials,
                    assets
                RESTART IDENTITY CASCADE
                """
            )
        yield conn
        conn.rollback()

from pathlib import Path

import psycopg
import structlog

from .config import Settings
from .db import connect


logger = structlog.get_logger(__name__)

MIGRATIONS_DIR = Path(__file__).resolve().parents[3] / "db" / "migrations"


def ensure_migrations_table(conn: psycopg.Connection) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version TEXT PRIMARY KEY,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )


def applied_versions(conn: psycopg.Connection) -> set[str]:
    with conn.cursor() as cur:
        cur.execute("SELECT version FROM schema_migrations")
        return {row[0] for row in cur.fetchall()}


def apply_migration(conn: psycopg.Connection, version: str, sql: str) -> None:
    with conn.transaction():
        with conn.cursor() as cur:
            cur.execute(sql)
            cur.execute(
                "INSERT INTO schema_migrations (version) VALUES (%s)",
                (version,),
            )


def main() -> None:
    structlog.configure()
    settings = Settings()

    if not MIGRATIONS_DIR.exists():
        raise SystemExit(f"Missing migrations directory: {MIGRATIONS_DIR}")

    with connect(settings) as conn:
        ensure_migrations_table(conn)
        done = applied_versions(conn)

        migration_paths = sorted(MIGRATIONS_DIR.glob("*.sql"))
        for path in migration_paths:
            if path.name in done:
                continue

            logger.info("applying_migration", version=path.name)
            apply_migration(conn, path.name, path.read_text(encoding="utf-8"))
            logger.info("applied_migration", version=path.name)

    logger.info("migrations_complete", total=len(migration_paths))

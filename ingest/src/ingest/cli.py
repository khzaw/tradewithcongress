import structlog

from .config import Settings
from .db import connect


logger = structlog.get_logger(__name__)


def main() -> None:
    structlog.configure()
    settings = Settings()

    with connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute("select current_database(), current_user, version()")
            database, user, version = cur.fetchone()

    logger.info(
        "ingest_scaffold_ready",
        database=database,
        user=user,
        postgres=version.split(" ", maxsplit=2)[1],
    )

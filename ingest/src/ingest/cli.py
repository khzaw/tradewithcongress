from __future__ import annotations

import argparse
from datetime import UTC, datetime

import httpx
import structlog

from .config import Settings
from .db import connect
from .house import fetch_house_archive, parse_house_archive_zip, sync_house_metadata


logger = structlog.get_logger(__name__)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="ingest",
        description="Congressional disclosure ingestion worker",
    )
    subcommands = parser.add_subparsers(dest="command")

    subcommands.add_parser("doctor", help="Validate database connectivity")

    house_metadata = subcommands.add_parser(
        "house-metadata",
        help="Fetch and sync House Clerk yearly filing metadata",
    )
    house_metadata.add_argument(
        "--year",
        type=int,
        default=datetime.now(tz=UTC).year,
        help="Filing year to fetch from the House Clerk archive",
    )

    return parser


def run_doctor(settings: Settings) -> None:
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


def run_house_metadata(settings: Settings, *, year: int) -> None:
    with httpx.Client(timeout=30.0, follow_redirects=True) as client:
        archive = fetch_house_archive(year, timeout=30.0, client=client)
        records = parse_house_archive_zip(archive)

        with connect(settings) as conn:
            summary = sync_house_metadata(
                conn,
                year=year,
                records=records,
                document_storage_dir=settings.document_storage_dir,
                client=client,
            )

    logger.info(
        "house_metadata_synced",
        year=summary.year,
        records_processed=summary.records_processed,
        unique_officials=summary.unique_officials,
        filings_synced=summary.filings_synced,
        documents_synced=summary.documents_synced,
        documents_downloaded=summary.documents_downloaded,
        document_storage_dir=str(settings.document_storage_dir),
    )


def main() -> None:
    structlog.configure()
    parser = build_parser()
    args = parser.parse_args()
    settings = Settings()

    if args.command in {None, "doctor"}:
        run_doctor(settings)
        return

    if args.command == "house-metadata":
        run_house_metadata(settings, year=args.year)
        return

    raise SystemExit(f"Unsupported command: {args.command}")

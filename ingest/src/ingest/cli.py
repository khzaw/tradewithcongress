from __future__ import annotations

import argparse
from datetime import UTC, datetime

import httpx
import structlog

from .config import Settings
from .db import connect
from .house_assets import run_house_asset_sync
from .house_holdings import run_house_holdings_sync
from .house import fetch_house_archive, parse_house_archive_zip, sync_house_metadata
from .official_photos import fetch_legislator_photo_records, sync_official_photos
from .house_transactions import run_house_transaction_sync


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

    house_transactions = subcommands.add_parser(
        "house-transactions",
        help="Parse downloaded House PTR PDFs into transaction rows",
    )
    house_transactions.add_argument(
        "--year",
        type=int,
        default=datetime.now(tz=UTC).year,
        help="Filing year to parse for House PTR transactions",
    )
    house_transactions.add_argument(
        "--reparse",
        action="store_true",
        help="Reprocess documents that were already parsed successfully",
    )

    house_assets = subcommands.add_parser(
        "house-assets",
        help="Normalize House transaction assets and link transactions to canonical assets",
    )
    house_assets.add_argument(
        "--year",
        type=int,
        default=datetime.now(tz=UTC).year,
        help="Filing year to normalize for House transaction assets",
    )
    house_holdings = subcommands.add_parser(
        "house-holdings",
        help="Parse latest House non-PTR disclosure holdings into snapshot positions",
    )
    house_holdings.add_argument(
        "--year",
        type=int,
        default=datetime.now(tz=UTC).year,
        help="Filing year to parse for House disclosure holdings",
    )
    house_holdings.add_argument(
        "--reparse",
        action="store_true",
        help="Reprocess latest holdings documents even if already parsed",
    )

    subcommands.add_parser(
        "official-photos",
        help="Backfill official bioguide IDs and profile photo URLs",
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


def run_house_transactions(
    settings: Settings, *, year: int, reparse: bool = False
) -> None:
    with connect(settings) as conn:
        summary = run_house_transaction_sync(conn, settings, year=year, reparse=reparse)

    logger.info(
        "house_transactions_synced",
        year=summary.year,
        documents_processed=summary.documents_processed,
        documents_skipped=summary.documents_skipped,
        transactions_inserted=summary.transactions_inserted,
    )


def run_house_assets(settings: Settings, *, year: int) -> None:
    with connect(settings) as conn:
        summary = run_house_asset_sync(conn, year=year)

    logger.info(
        "house_assets_synced",
        year=summary.year,
        transactions_scanned=summary.transactions_scanned,
        assets_created=summary.assets_created,
        transactions_linked=summary.transactions_linked,
    )


def run_house_holdings(
    settings: Settings, *, year: int, reparse: bool = False
) -> None:
    with connect(settings) as conn:
        summary = run_house_holdings_sync(conn, settings, year=year, reparse=reparse)

    logger.info(
        "house_holdings_synced",
        year=summary.year,
        documents_processed=summary.documents_processed,
        documents_skipped=summary.documents_skipped,
        holdings_parsed=summary.holdings_parsed,
        positions_materialized=summary.positions_materialized,
    )


def run_official_photos(settings: Settings) -> None:
    with httpx.Client(timeout=30.0, follow_redirects=True) as client:
        legislators = fetch_legislator_photo_records(client)
        with connect(settings) as conn:
            summary = sync_official_photos(conn, legislators)

    logger.info(
        "official_photos_synced",
        officials_scanned=summary.officials_scanned,
        officials_matched=summary.officials_matched,
        officials_updated=summary.officials_updated,
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

    if args.command == "house-transactions":
        run_house_transactions(settings, year=args.year, reparse=args.reparse)
        return

    if args.command == "house-assets":
        run_house_assets(settings, year=args.year)
        return

    if args.command == "house-holdings":
        run_house_holdings(settings, year=args.year, reparse=args.reparse)
        return

    if args.command == "official-photos":
        run_official_photos(settings)
        return

    raise SystemExit(f"Unsupported command: {args.command}")

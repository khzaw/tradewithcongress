from __future__ import annotations

from datetime import UTC, datetime

import psycopg
import pytest

from ingest.config import Settings
from ingest.db import connect
from ingest.house import (
    HouseFilingRecord,
    build_house_archive_url,
    parse_house_archive_xml,
    sync_house_metadata,
)
from ingest.migrate import (
    MIGRATIONS_DIR,
    apply_migration,
    applied_versions,
    ensure_migrations_table,
)


SAMPLE_XML = b"""<?xml version="1.0" encoding="utf-8"?>
<FinancialDisclosure>
  <Member>
    <Prefix>Hon.</Prefix>
    <Last>Allen</Last>
    <First>Richard W.</First>
    <Suffix></Suffix>
    <FilingType>P</FilingType>
    <StateDst>GA12</StateDst>
    <Year>2026</Year>
    <FilingDate>1/15/2026</FilingDate>
    <DocID>20033751</DocID>
  </Member>
  <Member>
    <Prefix></Prefix>
    <Last>Anderson</Last>
    <First>Elizabeth</First>
    <Suffix></Suffix>
    <FilingType>W</FilingType>
    <StateDst>AL06</StateDst>
    <Year>2026</Year>
    <FilingDate>1/20/2026</FilingDate>
    <DocID>8036</DocID>
  </Member>
</FinancialDisclosure>
"""


def test_parse_house_archive_xml_extracts_records() -> None:
    records = parse_house_archive_xml(SAMPLE_XML)

    assert len(records) == 2
    assert records[0].display_name == "Richard W. Allen"
    assert records[0].middle_name == "W."
    assert records[0].report_type == "periodic_transaction_report"
    assert records[0].pdf_url.endswith("/ptr-pdfs/2026/20033751.pdf")
    assert records[1].official_type == "candidate"
    assert records[1].is_current is False
    assert records[1].pdf_url.endswith("/financial-pdfs/2026/8036.pdf")


def test_build_house_archive_url_uses_clerk_pattern() -> None:
    assert (
        build_house_archive_url(2026)
        == "https://disclosures-clerk.house.gov/public_disc/financial-pdfs/2026FD.zip"
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


def test_sync_house_metadata_is_idempotent(db_conn: psycopg.Connection) -> None:
    records = [
        HouseFilingRecord(
            prefix="Hon.",
            first_name="Richard",
            middle_name="W.",
            last_name="Allen",
            suffix=None,
            filing_type="P",
            state_code="GA",
            district_code="12",
            report_year=2026,
            filing_date=datetime(2026, 1, 15, tzinfo=UTC).date(),
            document_id="20033751",
        ),
        HouseFilingRecord(
            prefix="Hon.",
            first_name="Richard",
            middle_name="W.",
            last_name="Allen",
            suffix=None,
            filing_type="P",
            state_code="GA",
            district_code="12",
            report_year=2026,
            filing_date=datetime(2026, 2, 17, tzinfo=UTC).date(),
            document_id="20033945",
        ),
    ]

    first_sync = sync_house_metadata(db_conn, year=2026, records=records)
    second_sync = sync_house_metadata(db_conn, year=2026, records=records)

    assert first_sync.records_processed == 2
    assert second_sync.records_processed == 2

    with db_conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM officials")
        officials_count, = cur.fetchone()
        cur.execute("SELECT count(*) FROM filings")
        filings_count, = cur.fetchone()
        cur.execute("SELECT count(*) FROM filing_documents")
        documents_count, = cur.fetchone()
        cur.execute("SELECT count(*) FROM official_aliases")
        aliases_count, = cur.fetchone()

    assert officials_count == 1
    assert filings_count == 2
    assert documents_count == 2
    assert aliases_count == 3

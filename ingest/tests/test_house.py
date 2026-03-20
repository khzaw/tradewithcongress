from __future__ import annotations

from datetime import UTC, datetime

import httpx

from ingest.house import (
    HouseFilingRecord,
    build_house_archive_url,
    parse_house_archive_xml,
    persist_house_document,
    sha256_digest,
    sync_house_metadata,
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


def test_persist_house_document_skips_existing_downloads(tmp_path) -> None:
    record = HouseFilingRecord(
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
    )
    payload = b"%PDF-1.7 test payload"
    call_count = {"value": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        call_count["value"] += 1
        assert str(request.url) == record.pdf_url
        return httpx.Response(200, content=payload)

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        first_store = persist_house_document(record, tmp_path, client)
        second_store = persist_house_document(record, tmp_path, client)

    expected_path = tmp_path / "house" / "2026" / "20033751.pdf"

    assert call_count["value"] == 1
    assert first_store.downloaded is True
    assert second_store.downloaded is False
    assert first_store.relative_path == "house/2026/20033751.pdf"
    assert expected_path.read_bytes() == payload
    assert first_store.sha256 == sha256_digest(payload)
    assert second_store.sha256 == sha256_digest(payload)


def test_sync_house_metadata_is_idempotent(
    db_conn, tmp_path
) -> None:
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

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=f"pdf:{request.url}".encode("utf-8"))

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        first_sync = sync_house_metadata(
            db_conn,
            year=2026,
            records=records,
            document_storage_dir=tmp_path,
            client=client,
        )
        second_sync = sync_house_metadata(
            db_conn,
            year=2026,
            records=records,
            document_storage_dir=tmp_path,
            client=client,
        )

    assert first_sync.records_processed == 2
    assert second_sync.records_processed == 2
    assert first_sync.documents_downloaded == 2
    assert second_sync.documents_downloaded == 0

    with db_conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM officials")
        officials_count, = cur.fetchone()
        cur.execute("SELECT count(*) FROM filings")
        filings_count, = cur.fetchone()
        cur.execute("SELECT count(*) FROM filing_documents")
        documents_count, = cur.fetchone()
        cur.execute("SELECT count(*) FROM official_aliases")
        aliases_count, = cur.fetchone()
        cur.execute(
            """
            SELECT count(*)
            FROM filing_documents
            WHERE storage_path IS NOT NULL AND sha256 IS NOT NULL
            """
        )
        stored_documents_count, = cur.fetchone()

    assert officials_count == 1
    assert filings_count == 2
    assert documents_count == 2
    assert aliases_count == 3
    assert stored_documents_count == 2

from __future__ import annotations

from datetime import date
from pathlib import Path
import shutil

import psycopg

from ingest.config import Settings
from ingest.house_transactions import (
    parse_house_ptr_text,
    run_house_transaction_sync,
)
from ingest.pdf import extract_pdf_text


FIXTURES_DIR = Path(__file__).parent / "fixtures"
HOUSE_PTR_FIXTURE = FIXTURES_DIR / "house_ptr_20034013.pdf"

MULTI_TRANSACTION_TEXT = """\
P T R
Clerk of the House of Representatives • Legislative Resource Center • B81 Cannon Building • Washington, DC 20515
F I
Name: Hon. Rob Bresnahan
Status: Member
State/District:PA08
T
ID Owner Asset Transaction
Type
Date Notification
Date
Amount Cap.
Gains >
$200?
Parkland, PA School District
Municipal Bond [GS]
P 02/20/202603/09/2026$50,001 -
$100,000
F S: New
S O: JP Morgan Brokerage Account #4
C: All investment decisions related to my personal financial portfolio are delegated to professional financial
advisors. I have no role in, nor am informed of, specific investment decisions prior to their execution. Accordingly, this
transaction was planned and executed by a financial advisor.
Pennsylvania State Turnpike
Commission Bond [GS]
P 03/06/202603/09/2026$50,001 -
$100,000
F S: New
S O: JP Morgan Brokerage Account #4
C: All investment decisions related to my personal financial portfolio are delegated to professional financial
advisors. I have no role in, nor am informed of, specific investment decisions prior to their execution. Accordingly, this
transaction was planned and executed by a financial advisor.
* For the complete list of asset type abbreviations, please visit https://fd.house.gov/reference/asset-type-codes.aspx.
I V D
JP Morgan Brokerage Account #4
L: US
C
All investment decisions related to my personal financial portfolio are delegated to professional financial advisors. I have no role in, nor am
informed of, specific investment decisions prior to their execution. Accordingly, these transactions were planned and executed by a
financial advisor.
Filing ID #20034202
"""

HEADER_SPLIT_AMOUNT_TEXT = """\
P T R
$200?
Verizon Communications Inc.S 01/30/202601/30/2026$15,001 -
Filing ID #20034034
ID Owner Asset Transaction
Type
Date Notification
Date
Amount Cap.
Gains >
$200?
Common Stock (VZ) [ST] $50,000
F S: New
* For the complete list of asset type abbreviations, please visit https://fd.house.gov/reference/asset-type-codes.aspx.
"""

HEADER_SPLIT_DETAILS_TEXT = """\
P T R
$200?
Waters Corporation Common Stock
(WAT) [ST]
S (partial) 02/13/202603/03/2026$1,001 - $15,000
Filing ID #20034190
ID Owner Asset Transaction
Type
Date Notification
Date
Amount Cap.
Gains >
$200?
F S: New
S O: Kean Family Partnership
* For the complete list of asset type abbreviations, please visit https://fd.house.gov/reference/asset-type-codes.aspx.
"""


def test_extract_pdf_text_reads_real_ptr_fixture() -> None:
    extracted = extract_pdf_text(HOUSE_PTR_FIXTURE)

    assert "Name: Hon. Sheri Biggs" in extracted
    assert "Filing ID #20034013" in extracted
    assert "KKR Real Estate Select Trust Class U" in extracted


def test_parse_house_ptr_text_parses_real_fixture() -> None:
    parsed = parse_house_ptr_text(extract_pdf_text(HOUSE_PTR_FIXTURE))

    assert parsed.filing_id == "20034013"
    assert len(parsed.transactions) == 1

    transaction = parsed.transactions[0]
    assert transaction.owner_type == "spouse"
    assert transaction.transaction_type == "purchase"
    assert transaction.transaction_date == date(2026, 1, 5)
    assert transaction.notification_date == date(2026, 2, 5)
    assert transaction.raw_ticker == "KRSOX"
    assert transaction.asset_type_code == "PS"
    assert transaction.amount_range_label == "$1,001 - $15,000"
    assert transaction.source_owner == "W.S.B Trust > UBS Financial Services 26"
    assert transaction.description == "Divided reinvestment in a professionally managed account."


def test_parse_house_ptr_text_handles_multiline_amounts_and_comments() -> None:
    parsed = parse_house_ptr_text(MULTI_TRANSACTION_TEXT)

    assert parsed.filing_id == "20034202"
    assert len(parsed.transactions) == 2
    assert parsed.transactions[0].owner_type == "self"
    assert parsed.transactions[0].amount_range_label == "$50,001 - $100,000"
    assert parsed.transactions[1].raw_asset_name == "Pennsylvania State Turnpike Commission Bond [GS]"
    assert parsed.transactions[1].comment is not None
    assert "financial advisor" in parsed.transactions[1].comment


def test_parse_house_ptr_text_handles_embedded_transaction_lines() -> None:
    parsed = parse_house_ptr_text(
        """\
P T R
$200?
2000152815SP Bitcoin (CRYPTO:BTC) [CT] P 12/18/202512/18/2025 $50,001 -
$100,000
F S: Amended
SP California St Go Call 12/1/27 4% due
12/1/47 [GS]
S (partial) 12/01/202501/07/2026$1,001 - $15,000
F S: New
* For the complete list of asset type abbreviations, please visit https://fd.house.gov/reference/asset-type-codes.aspx.
Filing ID #2000152815
"""
    )

    assert len(parsed.transactions) == 2
    assert parsed.transactions[0].owner_type == "spouse"
    assert parsed.transactions[0].raw_ticker == "BTC"
    assert parsed.transactions[1].transaction_modifier == "partial"
    assert parsed.transactions[1].transaction_type == "partial_sale"


def test_parse_house_ptr_text_repairs_header_split_embedded_transaction_lines() -> None:
    parsed = parse_house_ptr_text(HEADER_SPLIT_AMOUNT_TEXT)

    assert len(parsed.transactions) == 1
    assert parsed.transactions[0].raw_asset_name == "Verizon Communications Inc. Common Stock (VZ) [ST]"
    assert parsed.transactions[0].amount_range_label == "$15,001 - $50,000"
    assert parsed.issues == []


def test_parse_house_ptr_text_keeps_details_after_repeated_page_header() -> None:
    parsed = parse_house_ptr_text(HEADER_SPLIT_DETAILS_TEXT)

    assert len(parsed.transactions) == 1
    assert parsed.transactions[0].raw_asset_name == "Waters Corporation Common Stock (WAT) [ST]"
    assert parsed.transactions[0].filing_status == "New"
    assert parsed.transactions[0].source_owner == "Kean Family Partnership"
    assert parsed.issues == []


def test_run_house_transaction_sync_writes_transactions_and_parse_metadata(
    db_conn: psycopg.Connection,
    tmp_path,
) -> None:
    storage_dir = tmp_path / "documents"
    target_pdf = storage_dir / "house" / "2026" / HOUSE_PTR_FIXTURE.name.replace(
        "house_ptr_", ""
    )
    target_pdf.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(HOUSE_PTR_FIXTURE, target_pdf)

    with db_conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO officials (
                chamber,
                official_type,
                first_name,
                last_name,
                display_name,
                sort_name,
                state_code,
                district_code,
                is_current,
                source_ref
            )
            VALUES (
                'house',
                'member',
                'Sheri',
                'Biggs',
                'Sheri Biggs',
                'Biggs, Sheri',
                'SC',
                '03',
                TRUE,
                'house:sc:03:biggs:sheri'
            )
            RETURNING official_id
            """
        )
        official_id, = cur.fetchone()

        cur.execute(
            """
            INSERT INTO filings (
                official_id,
                source_system,
                external_filing_id,
                chamber,
                report_type,
                filer_display_name,
                filing_date,
                report_year,
                source_url
            )
            VALUES (
                %s,
                'house_clerk',
                '20034013',
                'house',
                'periodic_transaction_report',
                'Sheri Biggs',
                '2026-02-17',
                2026,
                'https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/2026/20034013.pdf'
            )
            RETURNING filing_id
            """,
            (official_id,),
        )
        filing_id, = cur.fetchone()

        cur.execute(
            """
            INSERT INTO filing_documents (
                filing_id,
                document_type,
                source_url,
                storage_path,
                mime_type,
                parse_status
            )
            VALUES (
                %s,
                'pdf',
                'https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/2026/20034013.pdf',
                'house/2026/20034013.pdf',
                'application/pdf',
                'pending'
            )
            """,
            (filing_id,),
        )

    summary = run_house_transaction_sync(
        db_conn,
        Settings(document_storage_dir=storage_dir),
        year=2026,
        reparse=True,
    )

    assert summary.documents_processed == 1
    assert summary.transactions_inserted == 1

    with db_conn.cursor() as cur:
        cur.execute(
            """
            SELECT owner_type, transaction_type, raw_ticker, amount_range_label
            FROM transactions
            WHERE filing_id = %s
            """,
            (filing_id,),
        )
        owner_type, transaction_type, raw_ticker, amount_range_label = cur.fetchone()

        cur.execute(
            """
            SELECT parse_status, extracted_text IS NOT NULL
            FROM filing_documents
            WHERE filing_id = %s
            """,
            (filing_id,),
        )
        parse_status, has_extracted_text = cur.fetchone()

        cur.execute(
            """
            SELECT status
            FROM parse_runs
            ORDER BY parse_run_id DESC
            LIMIT 1
            """
        )
        parse_run_status, = cur.fetchone()

    assert owner_type == "spouse"
    assert transaction_type == "purchase"
    assert raw_ticker == "KRSOX"
    assert amount_range_label == "$1,001 - $15,000"
    assert parse_status == "parsed"
    assert has_extracted_text is True
    assert parse_run_status == "succeeded"

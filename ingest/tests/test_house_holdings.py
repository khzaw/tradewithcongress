from __future__ import annotations

import psycopg

from ingest.house_holdings import parse_house_holdings_text, run_house_holdings_sync


CANDIDATE_SECTION_A_TEXT = """\
F D R
F I
Name: Colby Watson
F I
Filing Type: Candidate Report
S A: A "U" I
Asset Owner Value of Asset Income Type(s) Income
Current Year to
Filing
Income
Preceding
Year
Centene Corporation Common Stock (CNC) [ST] $15,001 - $50,000Capital Gains $1,001 - $2,500$1,001 -
$2,500
Cerus Corporation - Common Stock (CERS) [ST] $1,001 - $15,000Capital Gains $1 - $200 $201 -
$1,000
Vanguard Growth ETF (VUG) [EF] DC $1,001 - $15,000Capital Gains,
Interest
$201 - $1,000 $201 -
$1,000
* For the complete list of asset type abbreviations, please visit https://fd.house.gov/reference/asset-type-codes.aspx.
S C: E I
None disclosed.
"""

AMENDMENT_SECTION_A_TEXT = """\
F D R
F I
Name: Omed Hamid
F I
Filing Type: Amendment Report
S A: A "U" I
Asset Owner Value of Asset Income Type(s) Income
Current Year to Filing
Income
Preceding Year
KABULAY LIABILITY CO [OL] $1,001 - $15,000None
L: San Francisco, CA, US
D: Member interest in privately held LLC; no income received during reporting period.
* For the complete list of asset type abbreviations, please visit https://fd.house.gov/reference/asset-type-codes.aspx.
S C: E I
Source Type Amount
"""

EMPTY_NOTICE_TEXT = """\
C N R
F D
R
Dear Mister Clerk:
This is to notify you that I have not yet raised (either through contributions or loans from myself or others) or spent in excess of $5,000 for
my campaign for the U.S. House of Representatives.
Name: Carter Jordan Weeks
Filing ID #40004902
"""


def test_parse_house_holdings_text_parses_section_a_assets() -> None:
    parsed = parse_house_holdings_text(CANDIDATE_SECTION_A_TEXT)

    assert parsed.parse_status == "parsed"
    assert len(parsed.holdings) == 3
    assert parsed.holdings[0].raw_ticker == "CNC"
    assert parsed.holdings[1].asset_type_code == "ST"
    assert parsed.holdings[2].owner_type == "dependent_child"
    assert parsed.holdings[2].amount_range_label == "$1,001 - $15,000"


def test_parse_house_holdings_text_preserves_section_a_details() -> None:
    parsed = parse_house_holdings_text(AMENDMENT_SECTION_A_TEXT)

    assert parsed.parse_status == "parsed"
    assert len(parsed.holdings) == 1
    assert parsed.holdings[0].raw_asset_name == "KABULAY LIABILITY CO [OL]"
    assert parsed.holdings[0].location == "San Francisco, CA, US"
    assert "privately held LLC" in (parsed.holdings[0].description or "")


def test_parse_house_holdings_text_skips_candidate_notice_documents() -> None:
    parsed = parse_house_holdings_text(EMPTY_NOTICE_TEXT)

    assert parsed.parse_status == "skipped"
    assert parsed.holdings == []
    assert parsed.issues[0].issue_code == "candidate_notice_only"


def test_run_house_holdings_sync_materializes_latest_snapshot_positions(
    db_conn: psycopg.Connection,
    tmp_path,
    monkeypatch,
) -> None:
    storage_dir = tmp_path / "documents"
    target = storage_dir / "house" / "2026" / "10073174.pdf"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(b"%PDF-1.4\n")
    monkeypatch.setattr(
        "ingest.house_holdings.extract_pdf_text",
        lambda _path, **_kwargs: CANDIDATE_SECTION_A_TEXT,
    )

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
                is_current,
                source_ref
            )
            VALUES (
                'house',
                'candidate',
                'Colby',
                'Watson',
                'Colby Watson',
                'Watson, Colby',
                TRUE,
                'house:nc:08:watson:colby'
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
                report_year
            )
            VALUES (
                %s,
                'house_clerk',
                '10073174',
                'house',
                'candidate_report',
                'Colby Watson',
                '2026-01-09',
                2026
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
                storage_path,
                mime_type,
                parse_status
            )
            VALUES (%s, 'pdf', 'house/2026/10073174.pdf', 'application/pdf', 'pending')
            """,
            (filing_id,),
        )

    summary = run_house_holdings_sync(
        db_conn,
        settings=type("SettingsStub", (), {"document_storage_dir": storage_dir})(),
        year=2026,
        reparse=True,
    )

    assert summary.documents_processed == 1
    assert summary.documents_skipped == 0
    assert summary.holdings_parsed == 3
    assert summary.positions_materialized == 3

    with db_conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM positions")
        positions, = cur.fetchone()
        cur.execute("SELECT count(*) FROM position_events")
        events, = cur.fetchone()
        cur.execute(
            """
            SELECT parse_status, extracted_text <> ''
            FROM filing_documents
            WHERE filing_id = %s
            """,
            (filing_id,),
        )
        parse_status, has_text = cur.fetchone()

    assert positions == 3
    assert events == 3
    assert parse_status == "parsed"
    assert has_text is True

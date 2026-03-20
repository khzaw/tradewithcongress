from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
import re
from typing import Literal

import psycopg
from psycopg.rows import dict_row, tuple_row
from psycopg.types.json import Jsonb

from .config import Settings
from .house_assets import AssetSignature, HouseAssetCandidate, ensure_asset
from .house_transactions import (
    IssueSeverity,
    OwnerType,
    ParseIssueRecord,
    extract_asset_type_code,
    extract_ticker,
    parse_amount_range,
)
from .pdf import extract_pdf_text


DETAIL_PREFIX_PATTERN = re.compile(r"^(?P<key>[A-Z])\s*:\s*(?P<value>.*)$")
HOLDING_HEADER_PATTERN = re.compile(
    r"^(?P<asset>.+?\[[A-Z]{1,4}\])"
    r"(?:\s+(?P<owner>SP|JT|DC))?"
    r"\s+(?P<value>\$\d[\d,]*(?:\.\d{2})?\s*-\s*\$\d[\d,]*(?:\.\d{2})?|\$\d[\d,]*(?:\.\d{2})?)"
    r"(?P<remainder>.*)$"
)
SECTION_A_START = 'S A: A "U" I'
SECTION_A_END_MARKERS = (
    "S C: E I",
    "S D: L",
    "S E: P",
    "S F: A",
    "S J: C E $5,000 P O S",
    "E S, D, T I",
)
SECTION_A_HEADER_LINES = frozenset(
    {
        "Asset Owner Value of Asset Income Type(s) Income",
        "Current",
        "Current Year",
        "Current Year to Filing",
        "Current Year to",
        "Year to",
        "to Filing",
        "Filing",
        "Income",
        "Preceding Year",
        "Preceding",
        "Year",
    }
)
EMPTY_DISCLOSURE_MARKERS = (
    "CAMPAIGN NOTICE",
    "Dear Mister Clerk:",
    "This is to notify you that I have not yet raised",
)

DETAIL_KEY_MAP: dict[str, str] = {
    "D": "description",
    "L": "location",
    "C": "comment",
}

OWNER_TYPE_BY_CODE: dict[str, OwnerType] = {
    "SP": "spouse",
    "JT": "joint",
    "DC": "dependent_child",
}
CONFIDENCE_SCORE = Decimal("0.950")


@dataclass(frozen=True, slots=True)
class HouseHolding:
    row_number: int
    owner_type: OwnerType
    raw_asset_name: str
    raw_ticker: str | None
    asset_type_code: str | None
    amount_range_label: str
    amount_min: Decimal | None
    amount_max: Decimal | None
    description: str | None
    location: str | None
    comment: str | None
    raw_income_text: str | None


@dataclass(frozen=True, slots=True)
class HouseHoldingsParseResult:
    extracted_text: str
    holdings: list[HouseHolding]
    issues: list[ParseIssueRecord]
    parse_status: Literal["parsed", "skipped"]


@dataclass(frozen=True, slots=True)
class HouseHoldingsDocument:
    filing_id: int
    filing_document_id: int
    official_id: int
    external_filing_id: str
    filing_date: str
    report_type: str
    storage_path: str


@dataclass(frozen=True, slots=True)
class HouseHoldingsSyncSummary:
    year: int
    documents_processed: int
    documents_skipped: int
    holdings_parsed: int
    positions_materialized: int


@dataclass(frozen=True, slots=True)
class AggregatedHoldingPosition:
    asset_id: int
    owner_type: OwnerType
    amount_min: Decimal | None
    amount_max: Decimal | None
    amount_range_label: str
    holdings: tuple[HouseHolding, ...]


def run_house_holdings_sync(
    conn: psycopg.Connection,
    settings: Settings,
    *,
    year: int,
    reparse: bool = False,
) -> HouseHoldingsSyncSummary:
    documents = list_house_holdings_documents(conn, year=year, reparse=reparse)
    documents_processed = 0
    documents_skipped = 0
    holdings_parsed = 0
    positions_materialized = 0

    for document in documents:
        summary = process_house_holdings_document(conn, settings, document)
        documents_processed += 1
        documents_skipped += 1 if summary.parse_status == "skipped" else 0
        holdings_parsed += summary.holdings_count
        positions_materialized += summary.positions_materialized

    return HouseHoldingsSyncSummary(
        year=year,
        documents_processed=documents_processed,
        documents_skipped=documents_skipped,
        holdings_parsed=holdings_parsed,
        positions_materialized=positions_materialized,
    )


@dataclass(frozen=True, slots=True)
class ProcessedHoldingsDocument:
    parse_status: Literal["parsed", "skipped"]
    holdings_count: int
    positions_materialized: int


def list_house_holdings_documents(
    conn: psycopg.Connection,
    *,
    year: int,
    reparse: bool,
) -> list[HouseHoldingsDocument]:
    parsed_filter = "" if reparse else "AND fd.parse_status = 'pending'"
    query = f"""
        WITH ranked_filings AS (
            SELECT
                f.filing_id,
                fd.filing_document_id,
                f.official_id,
                f.external_filing_id,
                f.filing_date,
                f.report_type,
                fd.storage_path,
                row_number() OVER (
                    PARTITION BY f.official_id
                    ORDER BY f.filing_date DESC, f.filing_id DESC
                ) AS filing_rank
            FROM filings f
            JOIN filing_documents fd ON fd.filing_id = f.filing_id
            WHERE f.source_system = 'house_clerk'
              AND f.report_year = %(year)s
              AND f.report_type IN ('candidate_report', 'financial_disclosure_report')
              AND fd.document_type = 'pdf'
              AND fd.storage_path IS NOT NULL
              {parsed_filter}
        )
        SELECT
            filing_id,
            filing_document_id,
            official_id,
            external_filing_id,
            filing_date::text,
            report_type,
            storage_path
        FROM ranked_filings
        WHERE filing_rank = 1
        ORDER BY filing_date, external_filing_id
    """
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(query, {"year": year})
        rows = cur.fetchall()

    return [
        HouseHoldingsDocument(
            filing_id=row["filing_id"],
            filing_document_id=row["filing_document_id"],
            official_id=row["official_id"],
            external_filing_id=row["external_filing_id"],
            filing_date=row["filing_date"],
            report_type=row["report_type"],
            storage_path=row["storage_path"],
        )
        for row in rows
    ]


def process_house_holdings_document(
    conn: psycopg.Connection,
    settings: Settings,
    document: HouseHoldingsDocument,
) -> ProcessedHoldingsDocument:
    parse_run_id = create_parse_run(conn, document.filing_document_id)
    path = settings.document_storage_dir / document.storage_path

    try:
        extracted_text = extract_pdf_text(path, ocr_fallback=True)
        parsed = parse_house_holdings_text(extracted_text)

        with conn.transaction():
            if parsed.parse_status == "parsed":
                positions_materialized = replace_snapshot_positions(
                    conn,
                    official_id=document.official_id,
                    filing_id=document.filing_id,
                    filing_date=document.filing_date,
                    holdings=parsed.holdings,
                )
            else:
                positions_materialized = 0

            update_filing_document_status(
                conn,
                filing_document_id=document.filing_document_id,
                parse_status=parsed.parse_status,
                extracted_text=parsed.extracted_text,
            )
            update_parse_run_success(conn, parse_run_id, parsed.issues)
            insert_parse_issues(conn, parse_run_id, parsed.issues)

        return ProcessedHoldingsDocument(
            parse_status=parsed.parse_status,
            holdings_count=len(parsed.holdings),
            positions_materialized=positions_materialized,
        )
    except Exception as exc:
        with conn.transaction():
            update_filing_document_status(
                conn,
                filing_document_id=document.filing_document_id,
                parse_status="failed",
                extracted_text=None,
            )
            update_parse_run_failure(conn, parse_run_id, exc)
            insert_parse_issues(
                conn,
                parse_run_id,
                [
                    ParseIssueRecord(
                        severity="error",
                        issue_code="document_parse_failure",
                        message=str(exc),
                        context={"external_filing_id": document.external_filing_id},
                    )
                ],
            )
        raise


def parse_house_holdings_text(text: str) -> HouseHoldingsParseResult:
    stripped_text = text.strip()
    upper_text = stripped_text.upper()
    if not stripped_text:
        return HouseHoldingsParseResult(
            extracted_text=text,
            holdings=[],
            issues=[
                ParseIssueRecord(
                    severity="warning",
                    issue_code="ocr_required",
                    message="PDF text extraction returned no text; OCR is required.",
                    context={},
                )
            ],
            parse_status="skipped",
        )

    if any(marker.upper() in upper_text for marker in EMPTY_DISCLOSURE_MARKERS):
        return HouseHoldingsParseResult(
            extracted_text=text,
            holdings=[],
            issues=[
                ParseIssueRecord(
                    severity="info",
                    issue_code="candidate_notice_only",
                    message="Document is a candidate notice rather than a full holdings disclosure.",
                    context={},
                )
            ],
            parse_status="skipped",
        )

    section_lines = slice_section_a_lines(stripped_text.splitlines())
    if not section_lines:
        return HouseHoldingsParseResult(
            extracted_text=text,
            holdings=[],
            issues=[
                ParseIssueRecord(
                    severity="warning",
                    issue_code="missing_section_a",
                    message="Section A assets block was not found in the disclosure.",
                    context={},
                )
            ],
            parse_status="skipped",
        )

    holdings, issues = parse_section_a_holdings(section_lines)
    return HouseHoldingsParseResult(
        extracted_text=text,
        holdings=holdings,
        issues=issues,
        parse_status="parsed",
    )


def slice_section_a_lines(lines: list[str]) -> list[str]:
    start_index = -1
    for index, line in enumerate(lines):
        if line == SECTION_A_START:
            start_index = index + 1
            break

    if start_index == -1:
        return []

    end_index = len(lines)
    for index in range(start_index, len(lines)):
        if lines[index] in SECTION_A_END_MARKERS:
            end_index = index
            break

    raw_lines = [line.strip() for line in lines[start_index:end_index] if line.strip()]
    return normalize_section_a_lines(raw_lines)


def normalize_section_a_lines(lines: list[str]) -> list[str]:
    normalized_lines: list[str] = []
    for line in lines:
        if line.startswith("Filing ID #"):
            continue
        if line.startswith("* For the complete list of asset type abbreviations"):
            continue
        if line in SECTION_A_HEADER_LINES:
            continue
        normalized_lines.append(line)

    return normalized_lines


def parse_section_a_holdings(
    lines: list[str],
) -> tuple[list[HouseHolding], list[ParseIssueRecord]]:
    if len(lines) == 1 and lines[0] == "None disclosed.":
        return [], []

    holdings: list[HouseHolding] = []
    issues: list[ParseIssueRecord] = []
    core_lines: list[str] = []
    details: dict[str, str] = {}
    row_number = 0

    def flush_current() -> None:
        nonlocal core_lines, details, row_number
        if not core_lines:
            return
        row_number += 1
        holding, issue = build_holding(row_number=row_number, core_lines=core_lines, details=details)
        holdings.append(holding)
        if issue is not None:
            issues.append(issue)
        core_lines = []
        details = {}

    for line in lines:
        if line == "None disclosed." and not core_lines:
            continue

        detail_match = DETAIL_PREFIX_PATTERN.match(line)
        if detail_match is not None:
            key = DETAIL_KEY_MAP.get(detail_match.group("key"))
            if key is not None:
                details[key] = detail_match.group("value").strip() or None
                continue

        if core_lines and looks_like_new_holding_start(line):
            flush_current()

        core_lines.append(line)

    flush_current()
    return holdings, issues


def looks_like_new_holding_start(line: str) -> bool:
    return ("[" in line and "⇒" in line) or HOLDING_HEADER_PATTERN.match(line) is not None


def build_holding(
    *,
    row_number: int,
    core_lines: list[str],
    details: dict[str, str],
) -> tuple[HouseHolding, ParseIssueRecord | None]:
    normalized_core = " ".join(line.strip() for line in core_lines if line.strip())
    normalized_core = re.sub(r"\s+", " ", normalized_core).strip()
    match = HOLDING_HEADER_PATTERN.match(normalized_core)
    if match is None:
        raise ValueError(f"Unparseable Section A holding row: {normalized_core!r}")

    raw_asset_name = match.group("asset").strip()
    owner_code = match.group("owner")
    amount_range_label = collapse_compact_amount_spacing(match.group("value"))
    amount_min, amount_max, amount_issue = parse_amount_range(amount_range_label)
    asset_type_code = extract_asset_type_code(raw_asset_name)
    raw_ticker = extract_ticker(raw_asset_name)
    issue = None

    if amount_issue:
        issue = ParseIssueRecord(
            severity="warning",
            issue_code="unparsed_holding_value_range",
            message="Unable to normalize Section A asset value range.",
            context={"row_number": row_number, "amount_range_label": amount_range_label},
        )

    return (
        HouseHolding(
            row_number=row_number,
            owner_type=OWNER_TYPE_BY_CODE.get(owner_code or "", "self"),
            raw_asset_name=raw_asset_name,
            raw_ticker=raw_ticker,
            asset_type_code=asset_type_code,
            amount_range_label=amount_range_label,
            amount_min=amount_min,
            amount_max=amount_max,
            description=details.get("description"),
            location=details.get("location"),
            comment=details.get("comment"),
            raw_income_text=match.group("remainder").strip() or None,
        ),
        issue,
    )


def collapse_compact_amount_spacing(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def replace_snapshot_positions(
    conn: psycopg.Connection,
    *,
    official_id: int,
    filing_id: int,
    filing_date: str,
    holdings: list[HouseHolding],
) -> int:
    clear_existing_snapshot_positions(conn, official_id=official_id)
    grouped_holdings: dict[tuple[int, OwnerType], list[HouseHolding]] = defaultdict(list)

    for holding in holdings:
        asset_id = ensure_holding_asset(conn, holding)
        grouped_holdings[(asset_id, holding.owner_type)].append(holding)

    inserted_positions = 0
    for aggregated_position in aggregate_snapshot_positions(grouped_holdings):
        position_id = insert_position(
            conn,
            official_id=official_id,
            filing_id=filing_id,
            filing_date=filing_date,
            aggregated_position=aggregated_position,
        )
        insert_position_event(
            conn,
            position_id=position_id,
            filing_id=filing_id,
            filing_date=filing_date,
            aggregated_position=aggregated_position,
        )
        inserted_positions += 1

    return inserted_positions


def aggregate_snapshot_positions(
    grouped_holdings: dict[tuple[int, OwnerType], list[HouseHolding]],
) -> list[AggregatedHoldingPosition]:
    aggregated_positions: list[AggregatedHoldingPosition] = []

    for (asset_id, owner_type), holdings in sorted(grouped_holdings.items()):
        amount_min = sum_decimal_values(holding.amount_min for holding in holdings)
        amount_max = sum_decimal_values(holding.amount_max for holding in holdings)
        amount_range_label = build_aggregated_amount_label(holdings, amount_min, amount_max)
        aggregated_positions.append(
            AggregatedHoldingPosition(
                asset_id=asset_id,
                owner_type=owner_type,
                amount_min=amount_min,
                amount_max=amount_max,
                amount_range_label=amount_range_label,
                holdings=tuple(holdings),
            )
        )

    return aggregated_positions


def sum_decimal_values(values: list[Decimal | None] | tuple[Decimal | None, ...] | object) -> Decimal | None:
    sequence = list(values) if not isinstance(values, list) else values
    if any(value is None for value in sequence):
        return None
    total = Decimal("0")
    for value in sequence:
        total += value
    return total


def build_aggregated_amount_label(
    holdings: list[HouseHolding],
    amount_min: Decimal | None,
    amount_max: Decimal | None,
) -> str:
    if len(holdings) == 1:
        return holdings[0].amount_range_label
    if amount_min is None or amount_max is None:
        labels = ", ".join(dict.fromkeys(holding.amount_range_label for holding in holdings))
        return f"Aggregated from {len(holdings)} holdings: {labels}"
    return f"{format_decimal_currency(amount_min)} - {format_decimal_currency(amount_max)}"


def format_decimal_currency(value: Decimal) -> str:
    integer_value = value.quantize(Decimal("1"))
    return f"${integer_value:,.0f}"


def clear_existing_snapshot_positions(conn: psycopg.Connection, *, official_id: int) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            DELETE FROM position_events
            WHERE position_id IN (
                SELECT position_id
                FROM positions
                WHERE official_id = %s
                  AND raw_metadata ->> 'source_system' = 'house_clerk'
                  AND raw_metadata ->> 'snapshot_kind' = 'section_a_holding'
            )
            """,
            (official_id,),
        )
        cur.execute(
            """
            DELETE FROM positions
            WHERE official_id = %s
              AND raw_metadata ->> 'source_system' = 'house_clerk'
              AND raw_metadata ->> 'snapshot_kind' = 'section_a_holding'
            """,
            (official_id,),
        )


def ensure_holding_asset(conn: psycopg.Connection, holding: HouseHolding) -> int:
    candidate = HouseAssetCandidate(
        signature=AssetSignature(
            ticker=holding.raw_ticker,
            asset_name=holding.raw_asset_name,
            issuer_name=derive_holding_issuer_name(holding.raw_asset_name),
            asset_type=normalize_holding_asset_type(holding.asset_type_code),
        ),
        is_exchange_traded=holding.raw_ticker is not None,
        transaction_ids=(),
        raw_asset_names=(holding.raw_asset_name,),
        source_asset_type_codes=tuple(
            code for code in [holding.asset_type_code] if code is not None
        ),
    )
    asset_id, _ = ensure_asset(conn, candidate)
    return asset_id


def normalize_holding_asset_type(asset_type_code: str | None) -> str:
    if asset_type_code is None:
        return "other"

    return {
        "BA": "bank_account",
        "DB": "defined_benefit",
        "EF": "etf",
        "IH": "insurance_holding",
        "MF": "mutual_fund",
        "OL": "ownership_interest",
        "OT": "other",
        "PE": "retirement_plan",
        "SA": "stock_award",
        "ST": "equity",
        "5F": "education_savings_plan",
    }.get(asset_type_code, f"house_{asset_type_code.lower()}")


def derive_holding_issuer_name(raw_asset_name: str) -> str | None:
    if "⇒" in raw_asset_name:
        _, _, tail = raw_asset_name.partition("⇒")
        return tail.strip()
    return raw_asset_name


def insert_position(
    conn: psycopg.Connection,
    *,
    official_id: int,
    filing_id: int,
    filing_date: str,
    aggregated_position: AggregatedHoldingPosition,
) -> int:
    raw_metadata = {
        "source_system": "house_clerk",
        "snapshot_kind": "section_a_holding",
        "filing_id": filing_id,
        "holding_count": len(aggregated_position.holdings),
        "rows": [
            {
                "fdr_row_number": holding.row_number,
                "raw_asset_name": holding.raw_asset_name,
                "raw_ticker": holding.raw_ticker,
                "asset_type_code": holding.asset_type_code,
                "description": holding.description,
                "location": holding.location,
                "comment": holding.comment,
                "raw_income_text": holding.raw_income_text,
                "amount_range_label": holding.amount_range_label,
            }
            for holding in aggregated_position.holdings
        ],
    }

    with conn.cursor(row_factory=tuple_row) as cur:
        cur.execute(
            """
            INSERT INTO positions (
                official_id,
                asset_id,
                owner_type,
                position_status,
                amount_min,
                amount_max,
                amount_range_label,
                confidence_score,
                confidence_label,
                rationale,
                as_of_filing_date,
                raw_metadata
            )
            VALUES (%s, %s, %s, 'confirmed', %s, %s, %s, %s, 'high', %s, %s, %s)
            RETURNING position_id
            """,
            (
                official_id,
                aggregated_position.asset_id,
                aggregated_position.owner_type,
                aggregated_position.amount_min,
                aggregated_position.amount_max,
                aggregated_position.amount_range_label,
                CONFIDENCE_SCORE,
                "Directly disclosed in House Section A holdings.",
                filing_date,
                Jsonb(raw_metadata),
            ),
        )
        position_id, = cur.fetchone()

    return position_id


def insert_position_event(
    conn: psycopg.Connection,
    *,
    position_id: int,
    filing_id: int,
    filing_date: str,
    aggregated_position: AggregatedHoldingPosition,
) -> None:
    details = {
        "source_system": "house_clerk",
        "snapshot_kind": "section_a_holding",
        "holding_count": len(aggregated_position.holdings),
        "amount_range_label": aggregated_position.amount_range_label,
        "rows": [
            {
                "row_number": holding.row_number,
                "raw_asset_name": holding.raw_asset_name,
                "raw_ticker": holding.raw_ticker,
                "amount_range_label": holding.amount_range_label,
                "description": holding.description,
                "location": holding.location,
                "comment": holding.comment,
                "raw_income_text": holding.raw_income_text,
            }
            for holding in aggregated_position.holdings
        ],
    }
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO position_events (
                position_id,
                filing_id,
                event_type,
                event_date,
                details
            )
            VALUES (%s, %s, 'disclosed_holding', %s, %s)
            """,
            (position_id, filing_id, filing_date, Jsonb(details)),
        )


def create_parse_run(conn: psycopg.Connection, filing_document_id: int) -> int:
    with conn.transaction():
        with conn.cursor(row_factory=tuple_row) as cur:
            cur.execute(
                """
                INSERT INTO parse_runs (
                    filing_document_id,
                    parser_name,
                    parser_version,
                    status
                )
                VALUES (%s, %s, %s, 'running')
                RETURNING parse_run_id
                """,
                (filing_document_id, "house_fdr_holdings", "0.1.0"),
            )
            parse_run_id, = cur.fetchone()
    return parse_run_id


def update_filing_document_status(
    conn: psycopg.Connection,
    *,
    filing_document_id: int,
    parse_status: str,
    extracted_text: str | None,
) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE filing_documents
            SET extracted_text = COALESCE(%s, extracted_text),
                parse_status = %s
            WHERE filing_document_id = %s
            """,
            (extracted_text, parse_status, filing_document_id),
        )


def update_parse_run_success(
    conn: psycopg.Connection,
    parse_run_id: int,
    issues: list[ParseIssueRecord],
) -> None:
    confidence_score = Decimal("0.950")
    if any(issue.severity == "warning" for issue in issues):
        confidence_score = Decimal("0.650")
    elif any(issue.severity == "info" for issue in issues):
        confidence_score = Decimal("0.750")

    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE parse_runs
            SET status = 'succeeded',
                confidence_score = %s,
                completed_at = now()
            WHERE parse_run_id = %s
            """,
            (confidence_score, parse_run_id),
        )


def update_parse_run_failure(
    conn: psycopg.Connection,
    parse_run_id: int,
    exc: Exception,
) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE parse_runs
            SET status = 'failed',
                completed_at = now(),
                raw_metadata = %s
            WHERE parse_run_id = %s
            """,
            (Jsonb({"error": str(exc)}), parse_run_id),
        )


def insert_parse_issues(
    conn: psycopg.Connection,
    parse_run_id: int,
    issues: list[ParseIssueRecord],
) -> None:
    if not issues:
        return

    with conn.cursor() as cur:
        cur.executemany(
            """
            INSERT INTO parse_issues (
                parse_run_id,
                severity,
                issue_code,
                message,
                context
            )
            VALUES (%s, %s, %s, %s, %s)
            """,
            [
                (
                    parse_run_id,
                    issue.severity,
                    issue.issue_code,
                    issue.message,
                    Jsonb(issue.context),
                )
                for issue in issues
            ],
        )

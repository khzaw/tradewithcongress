from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
import re
from typing import Literal

import psycopg
from psycopg.rows import dict_row, tuple_row
from psycopg.types.json import Jsonb

from .config import Settings
from .pdf import extract_pdf_text


OwnerType = Literal["self", "spouse", "joint", "dependent_child", "other", "unknown"]
IssueSeverity = Literal["info", "warning", "error"]

TRANSACTION_LINE_PATTERN = re.compile(
    r"^(?P<code>[A-Z])\s+"
    r"(?:\((?P<modifier>[^)]+)\)\s+)?"
    r"(?P<transaction_date>\d{2}/\d{2}/\d{4})\s*"
    r"(?P<notification_date>\d{2}/\d{2}/\d{4})\s*"
    r"(?P<amount>.+)$"
)
EMBEDDED_TRANSACTION_PATTERN = re.compile(
    r"(?P<transaction>"
    r"(?P<code>[A-Z])\s+"
    r"(?:\((?P<modifier>[^)]+)\)\s+)?"
    r"\d{2}/\d{2}/\d{4}\s*"
    r"\d{2}/\d{2}/\d{4}\s*"
    r".+)$"
)
AMOUNT_RANGE_PATTERN = re.compile(
    r"^\$(?P<minimum>[\d,]+(?:\.\d{2})?)\s*-\s*\$(?P<maximum>[\d,]+(?:\.\d{2})?)$"
)
AMOUNT_OVER_PATTERN = re.compile(
    r"^(?P<label>.+?)\s+Over\s+\$(?P<minimum>[\d,]+(?:\.\d{2})?)$"
)
EXACT_AMOUNT_PATTERN = re.compile(r"^\$(?P<amount>[\d,]+(?:\.\d{2})?)$")
DETAIL_PREFIX_PATTERN = re.compile(r"^(?P<key>[A-Z](?:\s+[A-Z])?)\s*:\s*(?P<value>.*)$")
TICKER_PATTERN = re.compile(
    r"\((?P<ticker>[A-Z][A-Z0-9.\-:]{0,20})\)(?:\s+\[[A-Z]{1,4}\])?\s*$"
)
ASSET_TYPE_PATTERN = re.compile(r"\[(?P<asset_type>[A-Z]{1,4})\]\s*$")
FILING_ID_PATTERN = re.compile(r"Filing ID #(?P<filing_id>\d+)")
LEADING_ROW_ID_PATTERN = re.compile(r"^\d{6,}\s*")

TRANSACTION_TYPE_BY_CODE: dict[str, str] = {
    "P": "purchase",
    "S": "sale",
    "E": "exchange",
}
OWNER_TYPE_BY_CODE: dict[str, OwnerType] = {
    "SP": "spouse",
    "JT": "joint",
    "DC": "dependent_child",
}
DETAIL_KEY_MAP: dict[str, str] = {
    "F S": "filing_status",
    "S O": "source_owner",
    "L": "location",
    "D": "description",
    "C": "comment",
}
FOOTER_MARKERS = (
    "* For the complete list of asset type abbreviations",
    "I V D",
    "I P O",
    "C S",
    "Digitally Signed:",
)


@dataclass(frozen=True, slots=True)
class HousePtrTransaction:
    row_number: int
    owner_code: str | None
    owner_type: OwnerType
    raw_asset_name: str
    raw_ticker: str | None
    asset_type_code: str | None
    transaction_code: str
    transaction_modifier: str | None
    transaction_type: str
    transaction_date: date
    notification_date: date
    amount_range_label: str
    amount_min: Decimal | None
    amount_max: Decimal | None
    filing_status: str | None
    source_owner: str | None
    location: str | None
    description: str | None
    comment: str | None

    @property
    def raw_payload(self) -> dict[str, object]:
        return {
            "owner_code": self.owner_code,
            "asset_type_code": self.asset_type_code,
            "transaction_code": self.transaction_code,
            "transaction_modifier": self.transaction_modifier,
            "filing_status": self.filing_status,
            "source_owner": self.source_owner,
            "location": self.location,
            "description": self.description,
            "comment": self.comment,
        }


@dataclass(frozen=True, slots=True)
class ParseIssueRecord:
    severity: IssueSeverity
    issue_code: str
    message: str
    context: dict[str, object]


@dataclass(frozen=True, slots=True)
class HousePtrParseResult:
    filing_id: str | None
    extracted_text: str
    transactions: list[HousePtrTransaction]
    issues: list[ParseIssueRecord]


@dataclass(frozen=True, slots=True)
class HousePtrDocument:
    filing_id: int
    filing_document_id: int
    official_id: int
    external_filing_id: str
    storage_path: str


@dataclass(frozen=True, slots=True)
class HouseTransactionSyncSummary:
    year: int
    documents_processed: int
    documents_skipped: int
    transactions_inserted: int


def parse_house_ptr_text(text: str) -> HousePtrParseResult:
    lines = [line for line in text.splitlines() if line]
    filing_id = extract_filing_id(lines)
    transaction_lines = slice_transaction_section(lines)
    transactions: list[HousePtrTransaction] = []
    issues: list[ParseIssueRecord] = []

    asset_buffer: list[str] = []
    index = 0

    while index < len(transaction_lines):
        line = transaction_lines[index]
        asset_prefix, embedded_transaction = split_embedded_transaction(line)

        if embedded_transaction is not None:
            if asset_prefix:
                asset_buffer.append(asset_prefix)
            transaction_line, consumed_lines = consume_transaction_line(
                [embedded_transaction, *transaction_lines[index + 1 :]],
                0,
            )
            index += consumed_lines
        elif is_transaction_line(line):
            transaction_line, index = consume_transaction_line(transaction_lines, index)
        else:
            asset_buffer.append(line)
            index += 1
            continue

        transaction, transaction_issues = build_transaction(
            row_number=len(transactions) + 1,
            asset_lines=asset_buffer,
            transaction_line=transaction_line,
        )
        transactions.append(transaction)
        issues.extend(transaction_issues)

        detail_map, index = consume_detail_lines(transaction_lines, index)
        transactions[-1] = merge_transaction_details(transaction, detail_map)
        asset_buffer = []

    if asset_buffer:
        issues.append(
            ParseIssueRecord(
                severity="warning",
                issue_code="dangling_asset_lines",
                message="Unconsumed asset lines remained after PTR parsing.",
                context={"lines": asset_buffer},
            )
        )

    return HousePtrParseResult(
        filing_id=filing_id,
        extracted_text=text,
        transactions=transactions,
        issues=issues,
    )


def run_house_transaction_sync(
    conn: psycopg.Connection,
    settings: Settings,
    *,
    year: int,
    reparse: bool = False,
) -> HouseTransactionSyncSummary:
    total_documents = count_house_ptr_documents(conn, year=year)
    documents = list_house_ptr_documents(conn, year=year, reparse=reparse)
    transactions_inserted = 0

    for document in documents:
        transactions_inserted += process_house_ptr_document(conn, settings, document)

    return HouseTransactionSyncSummary(
        year=year,
        documents_processed=len(documents),
        documents_skipped=0 if reparse else total_documents - len(documents),
        transactions_inserted=transactions_inserted,
    )


def list_house_ptr_documents(
    conn: psycopg.Connection,
    *,
    year: int,
    reparse: bool,
) -> list[HousePtrDocument]:
    parsed_filter = "" if reparse else "AND fd.parse_status <> 'parsed'"
    query = f"""
        SELECT
            f.filing_id,
            fd.filing_document_id,
            f.official_id,
            f.external_filing_id,
            fd.storage_path
        FROM filings f
        JOIN filing_documents fd ON fd.filing_id = f.filing_id
        WHERE f.source_system = 'house_clerk'
          AND f.report_type = 'periodic_transaction_report'
          AND f.report_year = %(year)s
          AND fd.document_type = 'pdf'
          AND fd.storage_path IS NOT NULL
          {parsed_filter}
        ORDER BY f.filing_date, f.external_filing_id
    """
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(query, {"year": year})
        rows = cur.fetchall()

    return [
        HousePtrDocument(
            filing_id=row["filing_id"],
            filing_document_id=row["filing_document_id"],
            official_id=row["official_id"],
            external_filing_id=row["external_filing_id"],
            storage_path=row["storage_path"],
        )
        for row in rows
    ]


def count_house_ptr_documents(conn: psycopg.Connection, *, year: int) -> int:
    with conn.cursor(row_factory=tuple_row) as cur:
        cur.execute(
            """
            SELECT count(*)
            FROM filings f
            JOIN filing_documents fd ON fd.filing_id = f.filing_id
            WHERE f.source_system = 'house_clerk'
              AND f.report_type = 'periodic_transaction_report'
              AND f.report_year = %s
              AND fd.document_type = 'pdf'
              AND fd.storage_path IS NOT NULL
            """,
            (year,),
        )
        count, = cur.fetchone()
    return count


def process_house_ptr_document(
    conn: psycopg.Connection,
    settings: Settings,
    document: HousePtrDocument,
) -> int:
    parse_run_id = create_parse_run(conn, document.filing_document_id)

    try:
        extracted_text = extract_pdf_text(settings.document_storage_dir / document.storage_path)
        parsed = parse_house_ptr_text(extracted_text)

        with conn.transaction():
            replace_transactions(conn, document, parsed.transactions)
            update_filing_document_success(conn, document.filing_document_id, parsed.extracted_text)
            update_parse_run_success(conn, parse_run_id, parsed.issues)
            insert_parse_issues(conn, parse_run_id, parsed.issues)
            update_filing_transaction_count(conn, document.filing_id, len(parsed.transactions))

        return len(parsed.transactions)
    except Exception as exc:
        with conn.transaction():
            update_filing_document_failure(conn, document.filing_document_id)
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
                (filing_document_id, "house_ptr_parser", "0.1.0"),
            )
            parse_run_id, = cur.fetchone()
    return parse_run_id


def replace_transactions(
    conn: psycopg.Connection,
    document: HousePtrDocument,
    transactions: list[HousePtrTransaction],
) -> None:
    with conn.cursor() as cur:
        cur.execute("DELETE FROM transactions WHERE filing_id = %s", (document.filing_id,))
        cur.executemany(
            """
            INSERT INTO transactions (
                filing_id,
                official_id,
                source_row_number,
                transaction_date,
                notification_date,
                owner_type,
                transaction_type,
                amount_min,
                amount_max,
                amount_range_label,
                raw_ticker,
                raw_asset_name,
                comment,
                raw_transaction
            )
            VALUES (
                %(filing_id)s,
                %(official_id)s,
                %(source_row_number)s,
                %(transaction_date)s,
                %(notification_date)s,
                %(owner_type)s,
                %(transaction_type)s,
                %(amount_min)s,
                %(amount_max)s,
                %(amount_range_label)s,
                %(raw_ticker)s,
                %(raw_asset_name)s,
                %(comment)s,
                %(raw_transaction)s
            )
            """,
            [
                {
                    "filing_id": document.filing_id,
                    "official_id": document.official_id,
                    "source_row_number": transaction.row_number,
                    "transaction_date": transaction.transaction_date,
                    "notification_date": transaction.notification_date,
                    "owner_type": transaction.owner_type,
                    "transaction_type": transaction.transaction_type,
                    "amount_min": transaction.amount_min,
                    "amount_max": transaction.amount_max,
                    "amount_range_label": transaction.amount_range_label,
                    "raw_ticker": transaction.raw_ticker,
                    "raw_asset_name": transaction.raw_asset_name,
                    "comment": transaction.comment or transaction.description,
                    "raw_transaction": Jsonb(transaction.raw_payload),
                }
                for transaction in transactions
            ],
        )


def update_filing_document_success(
    conn: psycopg.Connection,
    filing_document_id: int,
    extracted_text: str,
) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE filing_documents
            SET extracted_text = %s,
                parse_status = 'parsed'
            WHERE filing_document_id = %s
            """,
            (extracted_text, filing_document_id),
        )


def update_filing_document_failure(conn: psycopg.Connection, filing_document_id: int) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE filing_documents
            SET parse_status = 'failed'
            WHERE filing_document_id = %s
            """,
            (filing_document_id,),
        )


def update_filing_transaction_count(
    conn: psycopg.Connection, filing_id: int, transaction_count: int
) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE filings
            SET transaction_count = %s,
                updated_at = now()
            WHERE filing_id = %s
            """,
            (transaction_count, filing_id),
        )


def update_parse_run_success(
    conn: psycopg.Connection,
    parse_run_id: int,
    issues: list[ParseIssueRecord],
) -> None:
    confidence_score = Decimal("0.900")
    if any(issue.severity == "warning" for issue in issues):
        confidence_score = Decimal("0.700")

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


def merge_transaction_details(
    transaction: HousePtrTransaction, details: dict[str, str]
) -> HousePtrTransaction:
    return HousePtrTransaction(
        row_number=transaction.row_number,
        owner_code=transaction.owner_code,
        owner_type=transaction.owner_type,
        raw_asset_name=transaction.raw_asset_name,
        raw_ticker=transaction.raw_ticker,
        asset_type_code=transaction.asset_type_code,
        transaction_code=transaction.transaction_code,
        transaction_modifier=transaction.transaction_modifier,
        transaction_type=transaction.transaction_type,
        transaction_date=transaction.transaction_date,
        notification_date=transaction.notification_date,
        amount_range_label=transaction.amount_range_label,
        amount_min=transaction.amount_min,
        amount_max=transaction.amount_max,
        filing_status=details.get("filing_status"),
        source_owner=details.get("source_owner"),
        location=details.get("location"),
        description=details.get("description"),
        comment=details.get("comment"),
    )


def extract_filing_id(lines: list[str]) -> str | None:
    for line in lines:
        match = FILING_ID_PATTERN.search(line)
        if match:
            return match.group("filing_id")
    return None


def slice_transaction_section(lines: list[str]) -> list[str]:
    start = 0
    for index, line in enumerate(lines):
        if line == "$200?":
            start = index + 1
            break

    end = len(lines)
    for index in range(start, len(lines)):
        if any(lines[index].startswith(marker) for marker in FOOTER_MARKERS):
            end = index
            break

    return lines[start:end]


def is_transaction_line(line: str) -> bool:
    return TRANSACTION_LINE_PATTERN.match(line) is not None


def split_embedded_transaction(line: str) -> tuple[str | None, str | None]:
    match = EMBEDDED_TRANSACTION_PATTERN.search(line)
    if match is None:
        return None, None

    asset_prefix = line[: match.start("transaction")].strip() or None
    transaction = match.group("transaction").strip()
    return asset_prefix, transaction


def consume_transaction_line(lines: list[str], start_index: int) -> tuple[str, int]:
    combined = lines[start_index]
    index = start_index + 1

    while index < len(lines) and looks_like_amount_continuation(lines[index]):
        combined = f"{combined} {lines[index]}"
        index += 1

    return combined, index


def looks_like_amount_continuation(line: str) -> bool:
    return line.startswith("$") or "Over $" in line


def consume_detail_lines(
    lines: list[str], start_index: int
) -> tuple[dict[str, str], int]:
    details: dict[str, str] = {}
    index = start_index

    while index < len(lines):
        line = lines[index]
        detail_match = DETAIL_PREFIX_PATTERN.match(line)
        if detail_match is None:
            break

        key = DETAIL_KEY_MAP.get(detail_match.group("key"), detail_match.group("key").lower())
        value_parts = [detail_match.group("value").strip()]
        index += 1

        while index < len(lines):
            candidate = lines[index]
            if DETAIL_PREFIX_PATTERN.match(candidate) or is_transaction_line(candidate):
                break
            if split_embedded_transaction(candidate)[1] is not None:
                break
            if is_asset_block_start(lines, index):
                break
            value_parts.append(candidate)
            index += 1

        details[key] = " ".join(part for part in value_parts if part).strip() or None

    return details, index


def is_asset_block_start(lines: list[str], index: int) -> bool:
    if lines[index][:1].islower():
        return False

    lookahead = min(index + 4, len(lines))
    for next_index in range(index, lookahead):
        if DETAIL_PREFIX_PATTERN.match(lines[next_index]):
            return False
        if is_transaction_line(lines[next_index]):
            return True
        if split_embedded_transaction(lines[next_index])[1] is not None:
            return True
    return False


def build_transaction(
    *,
    row_number: int,
    asset_lines: list[str],
    transaction_line: str,
) -> tuple[HousePtrTransaction, list[ParseIssueRecord]]:
    issues: list[ParseIssueRecord] = []
    raw_asset_name, owner_code, owner_type, raw_ticker, asset_type_code = parse_asset_lines(asset_lines)
    transaction_match = TRANSACTION_LINE_PATTERN.match(transaction_line)
    if transaction_match is None:
        raise ValueError(f"Unparseable transaction line: {transaction_line!r}")

    transaction_code = transaction_match.group("code")
    transaction_modifier = normalize_modifier(transaction_match.group("modifier"))
    transaction_type = normalize_transaction_type(transaction_code, transaction_modifier)
    if transaction_code not in TRANSACTION_TYPE_BY_CODE:
        issues.append(
            ParseIssueRecord(
                severity="warning",
                issue_code="unknown_transaction_code",
                message=f"Unknown House transaction code {transaction_code!r}.",
                context={"row_number": row_number, "line": transaction_line},
            )
        )

    amount_label = transaction_match.group("amount").strip()
    amount_min, amount_max, amount_issue = parse_amount_range(amount_label)
    if amount_issue:
        issues.append(
            ParseIssueRecord(
                severity="warning",
                issue_code="unparsed_amount_range",
                message="Unable to normalize PTR amount range.",
                context={"row_number": row_number, "amount_range_label": amount_label},
            )
        )

    if not asset_lines:
        issues.append(
            ParseIssueRecord(
                severity="error",
                issue_code="missing_asset_lines",
                message="Transaction was missing asset lines.",
                context={"row_number": row_number, "line": transaction_line},
            )
        )

    return (
        HousePtrTransaction(
            row_number=row_number,
            owner_code=owner_code,
            owner_type=owner_type,
            raw_asset_name=raw_asset_name,
            raw_ticker=raw_ticker,
            asset_type_code=asset_type_code,
            transaction_code=transaction_code,
            transaction_modifier=transaction_modifier,
            transaction_type=transaction_type,
            transaction_date=datetime.strptime(
                transaction_match.group("transaction_date"), "%m/%d/%Y"
            ).date(),
            notification_date=datetime.strptime(
                transaction_match.group("notification_date"), "%m/%d/%Y"
            ).date(),
            amount_range_label=amount_label,
            amount_min=amount_min,
            amount_max=amount_max,
            filing_status=None,
            source_owner=None,
            location=None,
            description=None,
            comment=None,
        ),
        issues,
    )


def normalize_modifier(value: str | None) -> str | None:
    if value is None:
        return None
    return value.strip().lower().replace(" ", "_")


def normalize_transaction_type(code: str, modifier: str | None) -> str:
    base_type = TRANSACTION_TYPE_BY_CODE.get(code, code.lower())
    if modifier is None:
        return base_type
    return f"{modifier}_{base_type}"


def parse_asset_lines(
    asset_lines: list[str],
) -> tuple[str, str | None, OwnerType, str | None, str | None]:
    joined = " ".join(asset_lines).strip()
    if not joined:
        return "", None, "unknown", None, None

    first_line = LEADING_ROW_ID_PATTERN.sub("", asset_lines[0])
    first_token, _, remainder = first_line.partition(" ")
    owner_code = first_token if first_token in OWNER_TYPE_BY_CODE else None
    owner_type = OWNER_TYPE_BY_CODE.get(first_token, "self")

    normalized_asset_lines = asset_lines.copy()
    normalized_asset_lines[0] = first_line
    if owner_code is not None:
        normalized_asset_lines[0] = remainder.strip()

    raw_asset_name = " ".join(line for line in normalized_asset_lines if line).strip()
    raw_ticker = extract_ticker(raw_asset_name)
    asset_type_code = extract_asset_type_code(raw_asset_name)
    return raw_asset_name, owner_code, owner_type, raw_ticker, asset_type_code


def extract_ticker(asset_name: str) -> str | None:
    match = TICKER_PATTERN.search(asset_name)
    if match is None:
        return None
    return match.group("ticker").split(":")[-1]


def extract_asset_type_code(asset_name: str) -> str | None:
    match = ASSET_TYPE_PATTERN.search(asset_name)
    return match.group("asset_type") if match else None


def parse_amount_range(
    value: str,
) -> tuple[Decimal | None, Decimal | None, bool]:
    normalized = value.strip()

    if match := AMOUNT_RANGE_PATTERN.match(normalized):
        return (
            parse_decimal(match.group("minimum")),
            parse_decimal(match.group("maximum")),
            False,
        )

    if match := AMOUNT_OVER_PATTERN.match(normalized):
        return parse_decimal(match.group("minimum")), None, False

    if match := EXACT_AMOUNT_PATTERN.match(normalized):
        amount = parse_decimal(match.group("amount"))
        return amount, amount, False

    return None, None, True


def parse_decimal(value: str) -> Decimal:
    return Decimal(value.replace(",", ""))

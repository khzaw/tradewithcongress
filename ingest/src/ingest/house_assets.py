from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass
import re

import psycopg
from psycopg.rows import dict_row, tuple_row
from psycopg.types.json import Jsonb


ASSET_TICKER_SUFFIX_PATTERN = re.compile(
    r"\s+\([A-Z][A-Z0-9.\-:]{0,20}\)\s*$"
)
ASSET_TYPE_SUFFIX_PATTERN = re.compile(r"\s+\[[A-Z]{1,4}\]\s*$")
HEADER_NOISE_PREFIX_PATTERN = re.compile(r"^(?:\$200\?\s+)+")
OWNER_CODE_PREFIX_PATTERN = re.compile(r"^(?:SP|JT|DC)\s+")
WHITESPACE_PATTERN = re.compile(r"\s+")

HOUSE_ASSET_TYPE_BY_CODE: dict[str, str] = {
    "AB": "asset_backed_security",
    "CS": "corporate_security",
    "CT": "crypto",
    "GS": "government_security",
    "HN": "hedge_fund",
    "OI": "ownership_interest",
    "OL": "option_liability",
    "OP": "option",
    "OT": "other",
    "PS": "private_security",
    "ST": "equity",
    "VA": "variable_annuity",
}
EXCHANGE_TRADED_ASSET_TYPES = frozenset({"crypto", "equity", "etf", "fund", "option"})


@dataclass(frozen=True, slots=True)
class HouseAssetTransaction:
    transaction_id: int
    raw_asset_name: str
    raw_ticker: str | None
    asset_type_code: str | None


@dataclass(frozen=True, slots=True)
class AssetSignature:
    ticker: str | None
    asset_name: str
    issuer_name: str | None
    asset_type: str


@dataclass(frozen=True, slots=True)
class HouseAssetCandidate:
    signature: AssetSignature
    is_exchange_traded: bool | None
    transaction_ids: tuple[int, ...]
    raw_asset_names: tuple[str, ...]
    source_asset_type_codes: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class HouseAssetSyncSummary:
    year: int
    transactions_scanned: int
    assets_created: int
    transactions_linked: int


def run_house_asset_sync(
    conn: psycopg.Connection,
    *,
    year: int,
) -> HouseAssetSyncSummary:
    transactions = list_unlinked_house_transactions(conn, year=year)
    candidates = build_asset_candidates(transactions)
    assets_created = 0
    transactions_linked = 0

    with conn.transaction():
        for candidate in candidates:
            asset_id, created = ensure_asset(conn, candidate)
            if created:
                assets_created += 1
            transactions_linked += link_transactions_to_asset(
                conn,
                asset_id=asset_id,
                transaction_ids=candidate.transaction_ids,
            )

    return HouseAssetSyncSummary(
        year=year,
        transactions_scanned=len(transactions),
        assets_created=assets_created,
        transactions_linked=transactions_linked,
    )


def list_unlinked_house_transactions(
    conn: psycopg.Connection,
    *,
    year: int,
) -> list[HouseAssetTransaction]:
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            SELECT
                t.transaction_id,
                t.raw_asset_name,
                t.raw_ticker,
                t.raw_transaction ->> 'asset_type_code' AS asset_type_code
            FROM transactions t
            JOIN filings f ON f.filing_id = t.filing_id
            WHERE f.source_system = 'house_clerk'
              AND f.report_year = %(year)s
              AND t.asset_id IS NULL
            ORDER BY t.transaction_id
            """,
            {"year": year},
        )
        rows = cur.fetchall()

    return [
        HouseAssetTransaction(
            transaction_id=row["transaction_id"],
            raw_asset_name=row["raw_asset_name"],
            raw_ticker=row["raw_ticker"],
            asset_type_code=row["asset_type_code"],
        )
        for row in rows
    ]


def build_asset_candidates(
    transactions: Iterable[HouseAssetTransaction],
) -> list[HouseAssetCandidate]:
    grouped_transactions: dict[AssetSignature, list[HouseAssetTransaction]] = defaultdict(list)

    for transaction in transactions:
        grouped_transactions[normalize_asset_signature(transaction)].append(transaction)

    return [
        build_asset_candidate(signature, grouped)
        for signature, grouped in sorted(
            grouped_transactions.items(),
            key=lambda item: (
                item[0].ticker or "",
                item[0].asset_name,
                item[0].asset_type,
                item[0].issuer_name or "",
            ),
        )
    ]


def normalize_asset_signature(transaction: HouseAssetTransaction) -> AssetSignature:
    asset_name = normalize_asset_name(transaction.raw_asset_name)
    issuer_name = derive_issuer_name(asset_name)
    asset_type = normalize_asset_type(transaction.asset_type_code)
    ticker = normalize_ticker(transaction.raw_ticker)

    return AssetSignature(
        ticker=ticker,
        asset_name=asset_name,
        issuer_name=issuer_name,
        asset_type=asset_type,
    )


def normalize_asset_name(raw_asset_name: str) -> str:
    normalized = collapse_whitespace(raw_asset_name)
    without_header_noise = HEADER_NOISE_PREFIX_PATTERN.sub("", normalized)
    without_owner_code = OWNER_CODE_PREFIX_PATTERN.sub("", without_header_noise)
    without_type = ASSET_TYPE_SUFFIX_PATTERN.sub("", without_owner_code).strip()
    without_ticker = ASSET_TICKER_SUFFIX_PATTERN.sub("", without_type).strip()
    return collapse_whitespace(without_ticker)


def derive_issuer_name(asset_name: str) -> str | None:
    if not asset_name:
        return None

    issuer_name, separator, _ = asset_name.partition(" - ")
    if separator:
        return issuer_name.strip() or None
    return asset_name


def normalize_asset_type(asset_type_code: str | None) -> str:
    if asset_type_code is None:
        return "other"

    normalized_code = asset_type_code.strip().upper()
    return HOUSE_ASSET_TYPE_BY_CODE.get(normalized_code, f"house_{normalized_code.lower()}")


def normalize_ticker(raw_ticker: str | None) -> str | None:
    if raw_ticker is None:
        return None
    ticker = raw_ticker.strip().upper()
    return ticker or None


def build_asset_candidate(
    signature: AssetSignature,
    transactions: list[HouseAssetTransaction],
) -> HouseAssetCandidate:
    raw_asset_names = tuple(dict.fromkeys(transaction.raw_asset_name for transaction in transactions))
    source_asset_type_codes = tuple(
        dict.fromkeys(
            code
            for code in (transaction.asset_type_code for transaction in transactions)
            if code is not None
        )
    )

    is_exchange_traded = (
        signature.asset_type in EXCHANGE_TRADED_ASSET_TYPES
        if signature.ticker is not None
        else None
    )

    return HouseAssetCandidate(
        signature=signature,
        is_exchange_traded=is_exchange_traded,
        transaction_ids=tuple(transaction.transaction_id for transaction in transactions),
        raw_asset_names=raw_asset_names,
        source_asset_type_codes=source_asset_type_codes,
    )


def ensure_asset(
    conn: psycopg.Connection,
    candidate: HouseAssetCandidate,
) -> tuple[int, bool]:
    raw_metadata = {
        "normalization_version": "0.1.0",
        "source_system": "house_clerk",
        "source_asset_type_codes": list(candidate.source_asset_type_codes),
        "raw_asset_names": list(candidate.raw_asset_names),
    }

    with conn.cursor(row_factory=tuple_row) as cur:
        cur.execute(
            """
            INSERT INTO assets (
                ticker,
                asset_name,
                issuer_name,
                asset_type,
                is_exchange_traded,
                raw_metadata
            )
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT DO NOTHING
            RETURNING asset_id
            """,
            (
                candidate.signature.ticker,
                candidate.signature.asset_name,
                candidate.signature.issuer_name,
                candidate.signature.asset_type,
                candidate.is_exchange_traded,
                Jsonb(raw_metadata),
            ),
        )
        inserted_row = cur.fetchone()
        if inserted_row is not None:
            asset_id, = inserted_row
            return asset_id, True

        cur.execute(
            """
            SELECT asset_id
            FROM assets
            WHERE ticker IS NOT DISTINCT FROM %s
              AND asset_name_normalized = lower(%s)
              AND issuer_name_normalized IS NOT DISTINCT FROM lower(%s)
              AND asset_type = %s
            """,
            (
                candidate.signature.ticker,
                candidate.signature.asset_name,
                candidate.signature.issuer_name,
                candidate.signature.asset_type,
            ),
        )
        existing_row = cur.fetchone()

    if existing_row is None:
        raise LookupError("Asset upsert completed without a matching asset row.")

    asset_id, = existing_row
    return asset_id, False


def link_transactions_to_asset(
    conn: psycopg.Connection,
    *,
    asset_id: int,
    transaction_ids: tuple[int, ...],
) -> int:
    if not transaction_ids:
        return 0

    with conn.cursor(row_factory=tuple_row) as cur:
        cur.execute(
            """
            UPDATE transactions
            SET asset_id = %(asset_id)s
            WHERE transaction_id = ANY(%(transaction_ids)s)
              AND asset_id IS DISTINCT FROM %(asset_id)s
            RETURNING transaction_id
            """,
            {"asset_id": asset_id, "transaction_ids": list(transaction_ids)},
        )
        rows = cur.fetchall()

    return len(rows)


def collapse_whitespace(value: str) -> str:
    return WHITESPACE_PATTERN.sub(" ", value).strip()

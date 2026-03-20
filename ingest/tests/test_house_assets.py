from __future__ import annotations

import psycopg

from ingest.house_assets import (
    AssetSignature,
    HouseAssetTransaction,
    build_asset_candidates,
    normalize_asset_signature,
    run_house_asset_sync,
)


def test_normalize_asset_signature_strips_suffixes_and_derives_issuer() -> None:
    signature = normalize_asset_signature(
        HouseAssetTransaction(
            transaction_id=1,
            raw_asset_name="Alphabet Inc. - Class A Common Stock (GOOGL) [ST]",
            raw_ticker="googl",
            asset_type_code="ST",
        )
    )

    assert signature == AssetSignature(
        ticker="GOOGL",
        asset_name="Alphabet Inc. - Class A Common Stock",
        issuer_name="Alphabet Inc.",
        asset_type="equity",
    )


def test_normalize_asset_signature_strips_house_header_noise() -> None:
    signature = normalize_asset_signature(
        HouseAssetTransaction(
            transaction_id=2,
            raw_asset_name="$200? JT Chevron Corporation Common Stock (CVX) [ST]",
            raw_ticker="CVX",
            asset_type_code="ST",
        )
    )

    assert signature == AssetSignature(
        ticker="CVX",
        asset_name="Chevron Corporation Common Stock",
        issuer_name="Chevron Corporation Common Stock",
        asset_type="equity",
    )


def test_build_asset_candidates_groups_equivalent_transactions() -> None:
    candidates = build_asset_candidates(
        [
            HouseAssetTransaction(
                transaction_id=10,
                raw_asset_name="Amazon.com, Inc. - Common Stock (AMZN) [ST]",
                raw_ticker="AMZN",
                asset_type_code="ST",
            ),
            HouseAssetTransaction(
                transaction_id=11,
                raw_asset_name="Amazon.com, Inc. - Common Stock (AMZN) [ST]",
                raw_ticker="amzn",
                asset_type_code="ST",
            ),
        ]
    )

    assert len(candidates) == 1
    assert candidates[0].signature.ticker == "AMZN"
    assert candidates[0].transaction_ids == (10, 11)
    assert candidates[0].is_exchange_traded is True


def test_run_house_asset_sync_links_transactions_to_assets_idempotently(
    db_conn: psycopg.Connection,
) -> None:
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
                'member',
                'Nancy',
                'Pelosi',
                'Nancy Pelosi',
                'Pelosi, Nancy',
                TRUE,
                'house:ca:11:pelosi:nancy'
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
                '20039999',
                'house',
                'periodic_transaction_report',
                'Nancy Pelosi',
                '2026-02-21',
                2026
            )
            RETURNING filing_id
            """,
            (official_id,),
        )
        filing_id, = cur.fetchone()

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
                raw_transaction
            )
            VALUES (
                %(filing_id)s,
                %(official_id)s,
                %(source_row_number)s,
                '2026-01-16',
                '2026-01-16',
                'spouse',
                'purchase',
                100001,
                250000,
                '$100,001 - $250,000',
                'NVDA',
                'NVIDIA Corporation - Common Stock (NVDA) [ST]',
                %(raw_transaction)s::jsonb
            )
            """,
            [
                {
                    "filing_id": filing_id,
                    "official_id": official_id,
                    "source_row_number": 1,
                    "raw_transaction": '{"asset_type_code":"ST"}',
                },
                {
                    "filing_id": filing_id,
                    "official_id": official_id,
                    "source_row_number": 2,
                    "raw_transaction": '{"asset_type_code":"ST"}',
                },
            ],
        )

    first_summary = run_house_asset_sync(db_conn, year=2026)
    second_summary = run_house_asset_sync(db_conn, year=2026)

    assert first_summary.transactions_scanned == 2
    assert first_summary.assets_created == 1
    assert first_summary.transactions_linked == 2

    assert second_summary.transactions_scanned == 0
    assert second_summary.assets_created == 0
    assert second_summary.transactions_linked == 0

    with db_conn.cursor() as cur:
        cur.execute(
            """
            SELECT ticker, asset_name, issuer_name, asset_type, is_exchange_traded
            FROM assets
            """
        )
        asset_row = cur.fetchone()

        cur.execute(
            """
            SELECT count(*), min(asset_id), max(asset_id)
            FROM transactions
            """
        )
        count, min_asset_id, max_asset_id = cur.fetchone()

    assert asset_row == (
        "NVDA",
        "NVIDIA Corporation - Common Stock",
        "NVIDIA Corporation",
        "equity",
        True,
    )
    assert count == 2
    assert min_asset_id is not None
    assert min_asset_id == max_asset_id

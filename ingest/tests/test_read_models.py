from __future__ import annotations

from datetime import date
from decimal import Decimal

import psycopg


def test_read_model_views_expose_official_and_ticker_page_data(
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
                state_code,
                district_code,
                party,
                is_current,
                source_ref
            )
            VALUES
                (
                    'house',
                    'member',
                    'Nancy',
                    'Pelosi',
                    'Nancy Pelosi',
                    'Pelosi, Nancy',
                    'CA',
                    '11',
                    'D',
                    TRUE,
                    'house:ca:11:pelosi:nancy'
                ),
                (
                    'house',
                    'member',
                    'Ro',
                    'Khanna',
                    'Ro Khanna',
                    'Khanna, Ro',
                    'CA',
                    '17',
                    'D',
                    TRUE,
                    'house:ca:17:khanna:ro'
                )
            RETURNING official_id, display_name
            """
        )
        officials = {display_name: official_id for official_id, display_name in cur.fetchall()}

        cur.executemany(
            """
            INSERT INTO official_aliases (official_id, alias, alias_kind)
            VALUES (%(official_id)s, %(alias)s, 'search')
            """,
            [
                {
                    "official_id": officials["Nancy Pelosi"],
                    "alias": "Speaker Pelosi",
                },
                {
                    "official_id": officials["Ro Khanna"],
                    "alias": "Representative Khanna",
                },
            ],
        )

        cur.execute(
            """
            INSERT INTO assets (
                ticker,
                asset_name,
                issuer_name,
                asset_type,
                is_exchange_traded
            )
            VALUES
                (
                    'NVDA',
                    'NVIDIA Corporation - Common Stock',
                    'NVIDIA Corporation',
                    'equity',
                    TRUE
                ),
                (
                    'AAPL',
                    'Apple Inc. - Common Stock',
                    'Apple Inc.',
                    'equity',
                    TRUE
                ),
                (
                    NULL,
                    'United States Treasury Bill',
                    'United States Treasury',
                    'government_security',
                    FALSE
                )
            RETURNING asset_id, COALESCE(ticker, asset_name)
            """
        )
        assets = {label: asset_id for asset_id, label in cur.fetchall()}

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
            VALUES
                (
                    %(nancy_id)s,
                    'house_clerk',
                    'nancy-holdings-2026',
                    'house',
                    'financial_disclosure_report',
                    'Nancy Pelosi',
                    '2026-01-31',
                    2026
                ),
                (
                    %(nancy_id)s,
                    'house_clerk',
                    'nancy-ptr-2026',
                    'house',
                    'periodic_transaction_report',
                    'Nancy Pelosi',
                    '2026-02-21',
                    2026
                ),
                (
                    %(ro_id)s,
                    'house_clerk',
                    'ro-ptr-2026',
                    'house',
                    'periodic_transaction_report',
                    'Ro Khanna',
                    '2026-02-25',
                    2026
                )
            RETURNING filing_id, external_filing_id
            """,
            {
                "nancy_id": officials["Nancy Pelosi"],
                "ro_id": officials["Ro Khanna"],
            },
        )
        filings = {
            external_filing_id: filing_id
            for filing_id, external_filing_id in cur.fetchall()
        }

        cur.executemany(
            """
            INSERT INTO transactions (
                filing_id,
                official_id,
                asset_id,
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
                %(asset_id)s,
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
                %(raw_transaction)s::jsonb
            )
            """,
            [
                {
                    "filing_id": filings["nancy-ptr-2026"],
                    "official_id": officials["Nancy Pelosi"],
                    "asset_id": assets["NVDA"],
                    "source_row_number": 1,
                    "transaction_date": "2026-01-16",
                    "notification_date": "2026-01-16",
                    "owner_type": "spouse",
                    "transaction_type": "purchase",
                    "amount_min": Decimal("100001"),
                    "amount_max": Decimal("250000"),
                    "amount_range_label": "$100,001 - $250,000",
                    "raw_ticker": "NVDA",
                    "raw_asset_name": "NVIDIA Corporation - Common Stock (NVDA) [ST]",
                    "raw_transaction": '{"asset_type_code":"ST"}',
                },
                {
                    "filing_id": filings["nancy-ptr-2026"],
                    "official_id": officials["Nancy Pelosi"],
                    "asset_id": assets["AAPL"],
                    "source_row_number": 2,
                    "transaction_date": "2026-01-20",
                    "notification_date": "2026-01-20",
                    "owner_type": "spouse",
                    "transaction_type": "sale",
                    "amount_min": Decimal("50001"),
                    "amount_max": Decimal("100000"),
                    "amount_range_label": "$50,001 - $100,000",
                    "raw_ticker": "AAPL",
                    "raw_asset_name": "Apple Inc. - Common Stock (AAPL) [ST]",
                    "raw_transaction": '{"asset_type_code":"ST"}',
                },
                {
                    "filing_id": filings["ro-ptr-2026"],
                    "official_id": officials["Ro Khanna"],
                    "asset_id": assets["NVDA"],
                    "source_row_number": 1,
                    "transaction_date": "2026-02-01",
                    "notification_date": "2026-02-01",
                    "owner_type": "self",
                    "transaction_type": "purchase",
                    "amount_min": Decimal("1001"),
                    "amount_max": Decimal("15000"),
                    "amount_range_label": "$1,001 - $15,000",
                    "raw_ticker": "NVDA",
                    "raw_asset_name": "NVIDIA Corporation - Common Stock (NVDA) [ST]",
                    "raw_transaction": '{"asset_type_code":"ST"}',
                },
            ],
        )

        cur.executemany(
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
                last_transaction_date
            )
            VALUES (
                %(official_id)s,
                %(asset_id)s,
                %(owner_type)s,
                %(position_status)s,
                %(amount_min)s,
                %(amount_max)s,
                %(amount_range_label)s,
                %(confidence_score)s,
                %(confidence_label)s,
                %(rationale)s,
                %(as_of_filing_date)s,
                %(last_transaction_date)s
            )
            """,
            [
                {
                    "official_id": officials["Nancy Pelosi"],
                    "asset_id": assets["NVDA"],
                    "owner_type": "spouse",
                    "position_status": "confirmed",
                    "amount_min": Decimal("100001"),
                    "amount_max": Decimal("250000"),
                    "amount_range_label": "$100,001 - $250,000",
                    "confidence_score": Decimal("0.950"),
                    "confidence_label": "high",
                    "rationale": "Disclosed in latest report",
                    "as_of_filing_date": "2026-01-31",
                    "last_transaction_date": "2026-01-16",
                },
                {
                    "official_id": officials["Nancy Pelosi"],
                    "asset_id": assets["United States Treasury Bill"],
                    "owner_type": "self",
                    "position_status": "confirmed",
                    "amount_min": Decimal("15001"),
                    "amount_max": Decimal("50000"),
                    "amount_range_label": "$15,001 - $50,000",
                    "confidence_score": Decimal("0.900"),
                    "confidence_label": "high",
                    "rationale": "Disclosed in latest report",
                    "as_of_filing_date": "2026-01-31",
                    "last_transaction_date": None,
                },
                {
                    "official_id": officials["Nancy Pelosi"],
                    "asset_id": assets["AAPL"],
                    "owner_type": "spouse",
                    "position_status": "exited",
                    "amount_min": Decimal("0"),
                    "amount_max": Decimal("0"),
                    "amount_range_label": "$0",
                    "confidence_score": Decimal("0.600"),
                    "confidence_label": "medium",
                    "rationale": "Exited after sale",
                    "as_of_filing_date": "2026-02-21",
                    "last_transaction_date": "2026-01-20",
                },
                {
                    "official_id": officials["Ro Khanna"],
                    "asset_id": assets["NVDA"],
                    "owner_type": "self",
                    "position_status": "confirmed",
                    "amount_min": Decimal("1001"),
                    "amount_max": Decimal("15000"),
                    "amount_range_label": "$1,001 - $15,000",
                    "confidence_score": Decimal("0.850"),
                    "confidence_label": "high",
                    "rationale": "Disclosed in latest report",
                    "as_of_filing_date": "2026-02-25",
                    "last_transaction_date": "2026-02-01",
                },
            ],
        )

    with db_conn.cursor() as cur:
        cur.execute(
            """
            SELECT
                filing_count,
                transaction_count,
                position_count,
                latest_filing_date,
                latest_ptr_filing_date,
                latest_transaction_date,
                aliases
            FROM official_profile_summaries_vw
            WHERE official_id = %s
            """,
            (officials["Nancy Pelosi"],),
        )
        official_summary = cur.fetchone()

        cur.execute(
            """
            SELECT ticker, asset_name, owner_type, portfolio_rank
            FROM official_portfolio_positions_vw
            WHERE official_id = %s
            ORDER BY portfolio_rank
            """,
            (officials["Nancy Pelosi"],),
        )
        portfolio_rows = cur.fetchall()

        cur.execute(
            """
            SELECT transaction_type, ticker, activity_rank
            FROM official_trade_activity_vw
            WHERE official_id = %s
            ORDER BY activity_rank
            """,
            (officials["Nancy Pelosi"],),
        )
        trade_rows = cur.fetchall()

        cur.execute(
            """
            SELECT
                representative_asset_name,
                transaction_count,
                trading_official_count,
                holder_count,
                latest_transaction_date,
                latest_position_filing_date
            FROM ticker_summaries_vw
            WHERE ticker = 'NVDA'
            """
        )
        ticker_summary = cur.fetchone()

        cur.execute(
            """
            SELECT official_display_name, transaction_type, ticker_activity_rank
            FROM ticker_trade_activity_vw
            WHERE ticker = 'NVDA'
            ORDER BY ticker_activity_rank
            """
        )
        ticker_trade_rows = cur.fetchall()

        cur.execute(
            """
            SELECT official_display_name, amount_range_label, holder_rank
            FROM ticker_latest_holders_vw
            WHERE ticker = 'NVDA'
            ORDER BY holder_rank
            """
        )
        holder_rows = cur.fetchall()

    assert official_summary == (
        2,
        2,
        2,
        date(2026, 2, 21),
        date(2026, 2, 21),
        date(2026, 1, 20),
        ["Speaker Pelosi"],
    )
    assert portfolio_rows == [
        ("NVDA", "NVIDIA Corporation - Common Stock", "spouse", 1),
        (None, "United States Treasury Bill", "self", 2),
    ]
    assert trade_rows == [
        ("sale", "AAPL", 1),
        ("purchase", "NVDA", 2),
    ]
    assert ticker_summary == (
        "NVIDIA Corporation - Common Stock",
        2,
        2,
        2,
        date(2026, 2, 1),
        date(2026, 2, 25),
    )
    assert ticker_trade_rows == [
        ("Ro Khanna", "purchase", 1),
        ("Nancy Pelosi", "purchase", 2),
    ]
    assert holder_rows == [
        ("Nancy Pelosi", "$100,001 - $250,000", 1),
        ("Ro Khanna", "$1,001 - $15,000", 2),
    ]

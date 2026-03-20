CREATE INDEX IF NOT EXISTS filings_official_filing_date_desc_idx
    ON filings (official_id, filing_date DESC);

CREATE INDEX IF NOT EXISTS transactions_official_transaction_date_desc_idx
    ON transactions (official_id, transaction_date DESC, transaction_id DESC);

CREATE INDEX IF NOT EXISTS transactions_asset_transaction_date_desc_idx
    ON transactions (asset_id, transaction_date DESC, transaction_id DESC);

CREATE INDEX IF NOT EXISTS positions_official_active_as_of_date_desc_idx
    ON positions (official_id, as_of_filing_date DESC, position_id DESC)
    WHERE position_status <> 'exited';

CREATE INDEX IF NOT EXISTS positions_asset_active_as_of_date_desc_idx
    ON positions (asset_id, as_of_filing_date DESC, position_id DESC)
    WHERE position_status <> 'exited';

CREATE INDEX IF NOT EXISTS assets_ticker_upper_idx
    ON assets (upper(ticker))
    WHERE ticker IS NOT NULL;

CREATE OR REPLACE VIEW official_profile_summaries_vw AS
WITH alias_stats AS (
    SELECT
        official_id,
        array_agg(alias ORDER BY alias) AS aliases
    FROM official_aliases
    GROUP BY official_id
),
filing_stats AS (
    SELECT
        official_id,
        count(*) AS filing_count,
        max(filing_date) AS latest_filing_date,
        max(filing_date) FILTER (
            WHERE report_type = 'periodic_transaction_report'
        ) AS latest_ptr_filing_date
    FROM filings
    GROUP BY official_id
),
transaction_stats AS (
    SELECT
        official_id,
        count(*) AS transaction_count,
        min(transaction_date) AS first_transaction_date,
        max(transaction_date) AS latest_transaction_date
    FROM transactions
    GROUP BY official_id
),
position_stats AS (
    SELECT
        official_id,
        count(*) FILTER (WHERE position_status <> 'exited') AS position_count,
        max(as_of_filing_date) FILTER (
            WHERE position_status <> 'exited'
        ) AS latest_position_filing_date
    FROM positions
    GROUP BY official_id
)
SELECT
    o.official_id,
    o.display_name,
    o.sort_name,
    o.chamber,
    o.official_type,
    o.state_code,
    o.district_code,
    o.party,
    o.is_current,
    o.source_ref,
    COALESCE(a.aliases, ARRAY[]::TEXT[]) AS aliases,
    COALESCE(f.filing_count, 0) AS filing_count,
    f.latest_filing_date,
    f.latest_ptr_filing_date,
    COALESCE(t.transaction_count, 0) AS transaction_count,
    t.first_transaction_date,
    t.latest_transaction_date,
    COALESCE(p.position_count, 0) AS position_count,
    p.latest_position_filing_date
FROM officials AS o
LEFT JOIN alias_stats AS a
    ON a.official_id = o.official_id
LEFT JOIN filing_stats AS f
    ON f.official_id = o.official_id
LEFT JOIN transaction_stats AS t
    ON t.official_id = o.official_id
LEFT JOIN position_stats AS p
    ON p.official_id = o.official_id;

CREATE OR REPLACE VIEW official_portfolio_positions_vw AS
SELECT
    p.position_id,
    p.official_id,
    o.display_name AS official_display_name,
    o.chamber,
    o.state_code,
    o.district_code,
    o.party,
    p.asset_id,
    a.ticker,
    a.asset_name,
    a.issuer_name,
    a.asset_type,
    a.is_exchange_traded,
    p.owner_type,
    p.position_status,
    p.amount_min,
    p.amount_max,
    p.amount_range_label,
    p.confidence_score,
    p.confidence_label,
    p.rationale,
    p.as_of_filing_date,
    p.last_transaction_date,
    row_number() OVER (
        PARTITION BY p.official_id
        ORDER BY
            COALESCE(p.amount_max, p.amount_min) DESC NULLS LAST,
            a.asset_name,
            p.position_id
    ) AS portfolio_rank
FROM positions AS p
JOIN officials AS o
    ON o.official_id = p.official_id
JOIN assets AS a
    ON a.asset_id = p.asset_id
WHERE p.position_status <> 'exited';

CREATE OR REPLACE VIEW official_trade_activity_vw AS
SELECT
    t.transaction_id,
    t.official_id,
    o.display_name AS official_display_name,
    o.chamber,
    o.state_code,
    o.district_code,
    o.party,
    t.filing_id,
    f.report_type,
    f.filing_date,
    t.asset_id,
    a.ticker,
    COALESCE(a.asset_name, t.raw_asset_name) AS asset_name,
    a.issuer_name,
    COALESCE(a.asset_type, 'unknown') AS asset_type,
    t.source_row_number,
    t.owner_type,
    t.transaction_type,
    t.transaction_date,
    t.notification_date,
    COALESCE(t.transaction_date, t.notification_date, f.filing_date) AS activity_date,
    t.amount_min,
    t.amount_max,
    t.amount_range_label,
    t.comment,
    t.raw_ticker,
    t.raw_asset_name,
    row_number() OVER (
        PARTITION BY t.official_id
        ORDER BY
            COALESCE(t.transaction_date, t.notification_date, f.filing_date) DESC,
            t.transaction_id DESC
    ) AS activity_rank
FROM transactions AS t
JOIN officials AS o
    ON o.official_id = t.official_id
JOIN filings AS f
    ON f.filing_id = t.filing_id
LEFT JOIN assets AS a
    ON a.asset_id = t.asset_id;

CREATE OR REPLACE VIEW ticker_trade_activity_vw AS
SELECT
    upper(a.ticker) AS ticker,
    t.transaction_id,
    t.official_id,
    o.display_name AS official_display_name,
    o.chamber,
    o.state_code,
    o.district_code,
    o.party,
    t.filing_id,
    f.filing_date,
    t.asset_id,
    a.asset_name,
    a.issuer_name,
    a.asset_type,
    t.owner_type,
    t.transaction_type,
    t.transaction_date,
    t.notification_date,
    COALESCE(t.transaction_date, t.notification_date, f.filing_date) AS activity_date,
    t.amount_min,
    t.amount_max,
    t.amount_range_label,
    row_number() OVER (
        PARTITION BY upper(a.ticker)
        ORDER BY
            COALESCE(t.transaction_date, t.notification_date, f.filing_date) DESC,
            t.transaction_id DESC
    ) AS ticker_activity_rank
FROM transactions AS t
JOIN assets AS a
    ON a.asset_id = t.asset_id
JOIN officials AS o
    ON o.official_id = t.official_id
JOIN filings AS f
    ON f.filing_id = t.filing_id
WHERE a.ticker IS NOT NULL;

CREATE OR REPLACE VIEW ticker_latest_holders_vw AS
SELECT
    upper(a.ticker) AS ticker,
    p.position_id,
    p.official_id,
    o.display_name AS official_display_name,
    o.chamber,
    o.state_code,
    o.district_code,
    o.party,
    p.asset_id,
    a.asset_name,
    a.issuer_name,
    a.asset_type,
    p.owner_type,
    p.position_status,
    p.amount_min,
    p.amount_max,
    p.amount_range_label,
    p.confidence_score,
    p.confidence_label,
    p.as_of_filing_date,
    p.last_transaction_date,
    row_number() OVER (
        PARTITION BY upper(a.ticker)
        ORDER BY
            COALESCE(p.amount_max, p.amount_min) DESC NULLS LAST,
            p.as_of_filing_date DESC NULLS LAST,
            p.position_id
    ) AS holder_rank
FROM positions AS p
JOIN assets AS a
    ON a.asset_id = p.asset_id
JOIN officials AS o
    ON o.official_id = p.official_id
WHERE a.ticker IS NOT NULL
  AND p.position_status <> 'exited';

CREATE OR REPLACE VIEW ticker_summaries_vw AS
WITH asset_reference_counts AS (
    SELECT
        a.asset_id,
        upper(a.ticker) AS ticker,
        a.asset_name,
        a.issuer_name,
        a.asset_type,
        (
            SELECT count(*)
            FROM transactions AS t
            WHERE t.asset_id = a.asset_id
        ) + (
            SELECT count(*)
            FROM positions AS p
            WHERE p.asset_id = a.asset_id
              AND p.position_status <> 'exited'
        ) AS reference_count
    FROM assets AS a
    WHERE a.ticker IS NOT NULL
),
ranked_assets AS (
    SELECT
        *,
        row_number() OVER (
            PARTITION BY ticker
            ORDER BY reference_count DESC, asset_id
        ) AS asset_rank
    FROM asset_reference_counts
),
transaction_stats AS (
    SELECT
        upper(a.ticker) AS ticker,
        count(*) AS transaction_count,
        count(DISTINCT t.official_id) AS trading_official_count,
        min(t.transaction_date) AS first_transaction_date,
        max(t.transaction_date) AS latest_transaction_date
    FROM transactions AS t
    JOIN assets AS a
        ON a.asset_id = t.asset_id
    WHERE a.ticker IS NOT NULL
    GROUP BY upper(a.ticker)
),
holder_stats AS (
    SELECT
        upper(a.ticker) AS ticker,
        count(*) AS holding_count,
        count(DISTINCT p.official_id) AS holder_count,
        max(p.as_of_filing_date) AS latest_position_filing_date
    FROM positions AS p
    JOIN assets AS a
        ON a.asset_id = p.asset_id
    WHERE a.ticker IS NOT NULL
      AND p.position_status <> 'exited'
    GROUP BY upper(a.ticker)
)
SELECT
    ra.ticker,
    ra.asset_name AS representative_asset_name,
    ra.issuer_name AS representative_issuer_name,
    ra.asset_type AS representative_asset_type,
    COALESCE(ts.transaction_count, 0) AS transaction_count,
    COALESCE(ts.trading_official_count, 0) AS trading_official_count,
    ts.first_transaction_date,
    ts.latest_transaction_date,
    COALESCE(hs.holding_count, 0) AS holding_count,
    COALESCE(hs.holder_count, 0) AS holder_count,
    hs.latest_position_filing_date
FROM ranked_assets AS ra
LEFT JOIN transaction_stats AS ts
    ON ts.ticker = ra.ticker
LEFT JOIN holder_stats AS hs
    ON hs.ticker = ra.ticker
WHERE ra.asset_rank = 1;

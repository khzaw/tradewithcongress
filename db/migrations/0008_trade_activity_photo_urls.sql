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
    ) AS activity_rank,
    o.photo_url
FROM transactions AS t
JOIN officials AS o
    ON o.official_id = t.official_id
JOIN filings AS f
    ON f.filing_id = t.filing_id
LEFT JOIN assets AS a
    ON a.asset_id = t.asset_id;

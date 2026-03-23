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
    ) AS ticker_activity_rank,
    o.photo_url
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
    ) AS holder_rank,
    o.photo_url
FROM positions AS p
JOIN assets AS a
    ON a.asset_id = p.asset_id
JOIN officials AS o
    ON o.official_id = p.official_id
WHERE a.ticker IS NOT NULL
  AND p.position_status <> 'exited';

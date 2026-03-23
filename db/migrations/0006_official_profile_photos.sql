ALTER TABLE officials
    ADD COLUMN IF NOT EXISTS bioguide_id TEXT,
    ADD COLUMN IF NOT EXISTS photo_url TEXT;

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
    p.latest_position_filing_date,
    o.photo_url
FROM officials AS o
LEFT JOIN alias_stats AS a
    ON a.official_id = o.official_id
LEFT JOIN filing_stats AS f
    ON f.official_id = o.official_id
LEFT JOIN transaction_stats AS t
    ON t.official_id = o.official_id
LEFT JOIN position_stats AS p
    ON p.official_id = o.official_id;

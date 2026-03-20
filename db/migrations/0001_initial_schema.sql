CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS officials (
    official_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    chamber TEXT NOT NULL CHECK (chamber IN ('house', 'senate')),
    official_type TEXT NOT NULL DEFAULT 'member' CHECK (official_type IN ('member', 'candidate', 'former_member', 'other')),
    first_name TEXT NOT NULL,
    middle_name TEXT,
    last_name TEXT NOT NULL,
    suffix TEXT,
    display_name TEXT NOT NULL,
    sort_name TEXT NOT NULL,
    state_code TEXT,
    district_code TEXT,
    party TEXT,
    is_current BOOLEAN NOT NULL DEFAULT TRUE,
    source_ref TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS official_aliases (
    official_alias_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    official_id BIGINT NOT NULL REFERENCES officials(official_id) ON DELETE CASCADE,
    alias TEXT NOT NULL,
    alias_normalized TEXT GENERATED ALWAYS AS (lower(alias)) STORED,
    alias_kind TEXT NOT NULL DEFAULT 'display' CHECK (alias_kind IN ('display', 'legal', 'search', 'source')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (official_id, alias_normalized)
);

CREATE TABLE IF NOT EXISTS filings (
    filing_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    official_id BIGINT REFERENCES officials(official_id) ON DELETE SET NULL,
    source_system TEXT NOT NULL CHECK (source_system IN ('house_clerk', 'senate_efd')),
    external_filing_id TEXT NOT NULL,
    chamber TEXT NOT NULL CHECK (chamber IN ('house', 'senate')),
    report_type TEXT NOT NULL,
    filer_display_name TEXT NOT NULL,
    filing_date DATE NOT NULL,
    filing_timestamp TIMESTAMPTZ,
    report_year INTEGER,
    transaction_count INTEGER NOT NULL DEFAULT 0 CHECK (transaction_count >= 0),
    is_amendment BOOLEAN NOT NULL DEFAULT FALSE,
    source_url TEXT,
    raw_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (source_system, external_filing_id)
);

CREATE TABLE IF NOT EXISTS filing_documents (
    filing_document_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    filing_id BIGINT NOT NULL REFERENCES filings(filing_id) ON DELETE CASCADE,
    document_type TEXT NOT NULL CHECK (document_type IN ('html', 'pdf', 'xml', 'txt', 'json', 'image', 'other')),
    source_url TEXT,
    storage_path TEXT,
    mime_type TEXT,
    sha256 TEXT,
    extracted_text TEXT,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    parse_status TEXT NOT NULL DEFAULT 'pending' CHECK (parse_status IN ('pending', 'parsed', 'failed', 'skipped')),
    raw_metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS assets (
    asset_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ticker TEXT,
    cusip TEXT,
    asset_name TEXT NOT NULL,
    asset_name_normalized TEXT GENERATED ALWAYS AS (lower(asset_name)) STORED,
    issuer_name TEXT,
    issuer_name_normalized TEXT GENERATED ALWAYS AS (
        CASE
            WHEN issuer_name IS NULL THEN NULL
            ELSE lower(issuer_name)
        END
    ) STORED,
    asset_type TEXT NOT NULL,
    is_exchange_traded BOOLEAN,
    raw_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transactions (
    transaction_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    filing_id BIGINT NOT NULL REFERENCES filings(filing_id) ON DELETE CASCADE,
    official_id BIGINT NOT NULL REFERENCES officials(official_id) ON DELETE RESTRICT,
    asset_id BIGINT REFERENCES assets(asset_id) ON DELETE SET NULL,
    source_row_number INTEGER,
    transaction_date DATE,
    notification_date DATE,
    owner_type TEXT NOT NULL CHECK (owner_type IN ('self', 'spouse', 'joint', 'dependent_child', 'other', 'unknown')),
    transaction_type TEXT NOT NULL,
    amount_min NUMERIC(16, 2),
    amount_max NUMERIC(16, 2),
    amount_range_label TEXT NOT NULL,
    raw_ticker TEXT,
    raw_asset_name TEXT NOT NULL,
    comment TEXT,
    raw_transaction JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (amount_min IS NULL OR amount_min >= 0),
    CHECK (amount_max IS NULL OR amount_max >= 0),
    CHECK (
        amount_min IS NULL
        OR amount_max IS NULL
        OR amount_min <= amount_max
    )
);

CREATE INDEX IF NOT EXISTS officials_chamber_idx
    ON officials (chamber);

CREATE INDEX IF NOT EXISTS official_aliases_official_id_idx
    ON official_aliases (official_id);

CREATE INDEX IF NOT EXISTS official_aliases_alias_normalized_trgm_idx
    ON official_aliases
    USING GIN (alias_normalized gin_trgm_ops);

CREATE INDEX IF NOT EXISTS filings_official_id_idx
    ON filings (official_id);

CREATE INDEX IF NOT EXISTS filings_chamber_filing_date_idx
    ON filings (chamber, filing_date DESC);

CREATE INDEX IF NOT EXISTS filing_documents_filing_id_idx
    ON filing_documents (filing_id);

CREATE INDEX IF NOT EXISTS assets_ticker_idx
    ON assets (ticker);

CREATE INDEX IF NOT EXISTS assets_asset_name_trgm_idx
    ON assets
    USING GIN (asset_name_normalized gin_trgm_ops);

CREATE INDEX IF NOT EXISTS assets_issuer_name_trgm_idx
    ON assets
    USING GIN (issuer_name_normalized gin_trgm_ops);

CREATE INDEX IF NOT EXISTS transactions_filing_id_idx
    ON transactions (filing_id);

CREATE INDEX IF NOT EXISTS transactions_official_id_idx
    ON transactions (official_id);

CREATE INDEX IF NOT EXISTS transactions_asset_id_idx
    ON transactions (asset_id);

CREATE INDEX IF NOT EXISTS transactions_transaction_date_idx
    ON transactions (transaction_date DESC);

CREATE INDEX IF NOT EXISTS transactions_raw_asset_name_trgm_idx
    ON transactions
    USING GIN (lower(raw_asset_name) gin_trgm_ops);

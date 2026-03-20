CREATE TABLE IF NOT EXISTS positions (
    position_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    official_id BIGINT NOT NULL REFERENCES officials(official_id) ON DELETE CASCADE,
    asset_id BIGINT NOT NULL REFERENCES assets(asset_id) ON DELETE CASCADE,
    owner_type TEXT NOT NULL CHECK (owner_type IN ('self', 'spouse', 'joint', 'dependent_child', 'other', 'unknown')),
    position_status TEXT NOT NULL CHECK (position_status IN ('confirmed', 'inferred', 'exited', 'unknown')),
    amount_min NUMERIC(16, 2),
    amount_max NUMERIC(16, 2),
    amount_range_label TEXT,
    confidence_score NUMERIC(4, 3) NOT NULL DEFAULT 0.500 CHECK (confidence_score >= 0 AND confidence_score <= 1),
    confidence_label TEXT NOT NULL CHECK (confidence_label IN ('high', 'medium', 'low')),
    rationale TEXT,
    as_of_filing_date DATE,
    last_transaction_date DATE,
    raw_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (official_id, asset_id, owner_type),
    CHECK (amount_min IS NULL OR amount_min >= 0),
    CHECK (amount_max IS NULL OR amount_max >= 0),
    CHECK (
        amount_min IS NULL
        OR amount_max IS NULL
        OR amount_min <= amount_max
    )
);

CREATE TABLE IF NOT EXISTS position_events (
    position_event_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    position_id BIGINT NOT NULL REFERENCES positions(position_id) ON DELETE CASCADE,
    filing_id BIGINT REFERENCES filings(filing_id) ON DELETE SET NULL,
    transaction_id BIGINT REFERENCES transactions(transaction_id) ON DELETE SET NULL,
    event_type TEXT NOT NULL CHECK (event_type IN ('disclosed_holding', 'transaction_update', 'inference', 'exit_inference', 'manual_review')),
    event_date DATE,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS parse_runs (
    parse_run_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    filing_document_id BIGINT NOT NULL REFERENCES filing_documents(filing_document_id) ON DELETE CASCADE,
    parser_name TEXT NOT NULL,
    parser_version TEXT,
    status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'succeeded', 'failed')),
    confidence_score NUMERIC(4, 3) CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1)),
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    raw_metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS parse_issues (
    parse_issue_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    parse_run_id BIGINT NOT NULL REFERENCES parse_runs(parse_run_id) ON DELETE CASCADE,
    severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'error')),
    issue_code TEXT NOT NULL,
    message TEXT NOT NULL,
    context JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS positions_official_id_idx
    ON positions (official_id);

CREATE INDEX IF NOT EXISTS positions_asset_id_idx
    ON positions (asset_id);

CREATE INDEX IF NOT EXISTS positions_status_idx
    ON positions (position_status);

CREATE INDEX IF NOT EXISTS position_events_position_id_idx
    ON position_events (position_id);

CREATE INDEX IF NOT EXISTS position_events_filing_id_idx
    ON position_events (filing_id);

CREATE INDEX IF NOT EXISTS position_events_transaction_id_idx
    ON position_events (transaction_id);

CREATE INDEX IF NOT EXISTS parse_runs_filing_document_id_idx
    ON parse_runs (filing_document_id);

CREATE INDEX IF NOT EXISTS parse_runs_status_idx
    ON parse_runs (status);

CREATE INDEX IF NOT EXISTS parse_issues_parse_run_id_idx
    ON parse_issues (parse_run_id);

CREATE INDEX IF NOT EXISTS parse_issues_severity_idx
    ON parse_issues (severity);

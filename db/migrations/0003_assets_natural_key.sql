CREATE UNIQUE INDEX IF NOT EXISTS assets_natural_key_uidx
    ON assets (
        ticker,
        asset_name_normalized,
        issuer_name_normalized,
        asset_type
    ) NULLS NOT DISTINCT;

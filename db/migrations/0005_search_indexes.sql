CREATE INDEX IF NOT EXISTS officials_display_name_trgm_idx
    ON officials
    USING GIN (lower(display_name) gin_trgm_ops);

CREATE UNIQUE INDEX IF NOT EXISTS officials_source_ref_uidx
    ON officials (source_ref);

CREATE UNIQUE INDEX IF NOT EXISTS filing_documents_filing_document_source_uidx
    ON filing_documents (filing_id, document_type, source_url);

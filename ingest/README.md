## ingest

Python ingestion and parsing worker for congressional disclosure data.

### Local development

```bash
uv sync
uv run ingest doctor
uv run ingest house-metadata --year 2026
uv run ingest house-transactions --year 2026
uv run ingest house-assets --year 2026
uv run ingest house-holdings --year 2026
uv run pytest
```

The worker currently supports:

- database connectivity checks via `doctor`
- House Clerk yearly metadata ingestion via `house-metadata`
- House PTR transaction parsing via `house-transactions`
- House asset normalization via `house-assets`
- House Section A holdings parsing via `house-holdings`
- local PDF persistence under `../data/documents`
- parser and sync tests via `pytest`

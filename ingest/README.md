## ingest

Python ingestion and parsing worker for congressional disclosure data.

### Local development

```bash
uv sync
uv run ingest doctor
uv run ingest house-metadata --year 2026
uv run pytest
```

The worker currently supports:

- database connectivity checks via `doctor`
- House Clerk yearly metadata ingestion via `house-metadata`
- parser and sync tests via `pytest`

# tradewithcongress

Low-cost congressional disclosure search and visualization project.

For project intent, architecture decisions, current implementation status, and next steps, start with `PROJECT_CONTEXT.md`.

## Stack

- `web/`: React + Vite + TypeScript
- `ingest/`: Python worker and parsing pipeline
- `db/`: Postgres bootstrap and future migrations
- `infra/`: deployment and environment notes

## Local development

1. Copy the environment file:

```bash
cp .env.example .env
```

2. Install project dependencies:

```bash
make bootstrap
```

3. Start local development:

```bash
make dev
```

That flow:
- starts local Postgres with Docker Compose
- boots the Vite dev server
- leaves the DB running for ingest work

Apply database migrations:

```bash
make migrate
```

Run the House metadata sync:

```bash
make ingest
```

That flow:
- imports the yearly House Clerk metadata archive
- downloads referenced PDFs into `data/documents/`
- upserts officials, filings, and source document records
- parses House PTR PDFs into `transactions`
- normalizes House transaction assets into canonical `assets` and links `transactions.asset_id`

Re-run just the House PTR parser:

```bash
make parse-house
```

Re-run just the House asset normalization step:

```bash
make normalize-assets
```

Run the ingest tests:

```bash
make test-ingest
```

Stop local services:

```bash
make db-down
```

## Layout

```text
web/      frontend app
ingest/   python ingestion worker
db/       sql bootstrap and migrations
infra/    deployment and environment docs
scripts/  local developer scripts
```

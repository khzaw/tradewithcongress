# tradewithcongress

Low-cost congressional disclosure search and visualization project.

For project intent, architecture decisions, current implementation status, and next steps, start with `PROJECT_CONTEXT.md`.

## Stack

- `api/`: versioned Bun + Hono read API
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
- starts the versioned read API on `http://localhost:8787/api/v1`
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
- parses the latest text-extractable House candidate/full disclosures into snapshot `positions`

Current page-facing read models in Postgres:
- `official_profile_summaries_vw`
- `official_portfolio_positions_vw`
- `official_trade_activity_vw`
- `ticker_summaries_vw`
- `ticker_trade_activity_vw`
- `ticker_latest_holders_vw`

Current HTTP API versioning rule:
- first public read endpoints live under `/api/v1`
- additive changes stay within `v1`
- breaking route or response-contract changes move to a new `/api/v{major}` namespace
- `BIGINT` ids are returned as strings from the API to avoid future precision issues in JS clients

Current search and lookup surface:
- `GET /api/v1/search?q=...&limit=...`
- grouped official and ticker results
- fuzzy official lookup via aliases + display-name trigram matching
- ticker and issuer lookup via exact ticker, prefix, and trigram matching

Re-run just the House PTR parser:

```bash
make parse-house
```

Re-run just the House asset normalization step:

```bash
make normalize-assets
```

Re-run just the House holdings snapshot parser:

```bash
make parse-holdings
```

Run the ingest tests:

```bash
make test-ingest
```

Run the API tests:

```bash
make test-api
```

Stop local services:

```bash
make db-down
```

## Layout

```text
api/      versioned read api
web/      frontend app
ingest/   python ingestion worker
db/       sql bootstrap and migrations
infra/    deployment and environment docs
scripts/  local developer scripts
```

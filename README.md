# tradewithcongress

Low-cost congressional disclosure search and visualization project.

For project intent, architecture decisions, current implementation status, and next steps, start with `PROJECT_CONTEXT.md`.

## Stack

- `api/`: versioned Bun + Hono read API
- `web/`: React + Vite + TypeScript
- styling: Tailwind CSS v4
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

Current dashboard surface:
- `GET /api/v1/overview?limit=...`
- tracked official / filing / trade / asset counts
- recent disclosure feed for the landing page
- monthly activity buckets for lightweight visualizations
- optional SPY/S&P benchmark overlay via cached Alpha Vantage weekly adjusted data when `ALPHA_VANTAGE_API_KEY` is configured

Current frontend browse surface:
- redesigned dashboard landing page with a flatter, higher-density command-center layout, activity panels, portfolio leaders, ticker flow, and recent disclosure tables
- landing-page search results and top cards link into official and ticker detail views
- shareable query-state URLs use `?official={id}` and `?ticker={symbol}`
- official detail views show latest disclosed holdings, recent trades, and visual portfolio/trade breakdowns
- ticker detail views show latest holders, recent trade activity, and a market-performance lane against SPY when the benchmark provider is configured
- benchmark panels are real UI surfaces and now consume live cached market data when `ALPHA_VANTAGE_API_KEY` is present
- the frontend styling system now runs on Tailwind CSS v4 rather than plain hand-authored global CSS

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

## Container runtime

The repo also includes production-oriented images for the API, web frontend, and ingest worker:

- `api/Dockerfile`: Bun + Hono read API
- `web/Dockerfile`: Vite static build served by nginx, with `/api/` proxied to the API service
- `ingest/Dockerfile`: Python/uv ingest worker with `poppler-utils` and `tesseract-ocr` for OCR-backed holdings parsing
- `docker-compose.prod.yml`: Postgres, API, web, migration, and one-off ingest job services

Set production secrets in `.env` or the shell before running the container stack. Use a real `POSTGRES_PASSWORD` outside local testing. The container stack uses `APP_DATABASE_URL` only when you need to override the default internal Compose database URL; the host-local `DATABASE_URL` remains for non-container scripts.

Build the images:

```bash
make docker-build
```

Run migrations once before starting the app services:

```bash
make docker-migrate
```

Start the containerized web/API/Postgres stack:

```bash
make docker-up
```

The web service publishes to `http://localhost:8080` by default. Override with `WEB_PORT=...`.

Run ingest commands as one-off jobs:

```bash
docker compose -f docker-compose.prod.yml --profile jobs run --rm ingest uv run ingest house-metadata --year 2026
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

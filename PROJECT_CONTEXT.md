# Project Context

Last updated: 2026-03-21

## What this project is

`tradewithcongress` is a side project that turns public congressional financial disclosures into a searchable, auditable product.

The intended user experience has two entry points:

- `ticker-first`: search a ticker and see which officials bought or sold it, when they traded it, when they filed it, and whether they appear to still hold it
- `official-first`: search an official and see their latest disclosed portfolio, recent trades, and source filings

This is not a real-time brokerage view. The product is based on delayed public disclosures and should always preserve:

- transaction date
- filing date
- source document provenance
- confidence/caveat language for inferred holdings

## Product direction

Primary product goals:

- automatically ingest House and Senate disclosures
- normalize officials, filings, assets, and transactions into a canonical schema
- reconstruct latest disclosed portfolio state
- support search from both official and ticker entry points
- make every derived claim traceable back to the source filing

Planned user-facing surfaces:

- universal search
- official profile pages
- ticker pages
- filing detail pages
- latest trades feed
- later: alerts, analytics, and portfolio-confidence views

## Current architecture decisions

Chosen stack:

- frontend: React + Vite + TypeScript
- ingestion/parsing: Python
- database: Postgres
- search: Postgres full-text search + `pg_trgm`
- local dev + production packaging: Docker Compose
- deployment target: Oracle Cloud Always Free Linux VM
- Python tooling: `uv`
- frontend tooling: `bun`

Intentional non-decisions:

- no Next.js
- no managed search engine yet
- no TimescaleDB for v1
- no Rust/OCaml in the v1 critical path

## Repo layout

```text
web/      frontend app
ingest/   python ingestion worker
db/       bootstrap SQL and migrations
infra/    deployment notes
scripts/  local developer scripts
data/     local downloaded source documents (gitignored)
```

## Local development workflow

Initial setup:

```bash
cp .env.example .env
make bootstrap
```

Day-to-day commands:

```bash
make dev
make migrate
make ingest
make test-ingest
make db-down
```

What they do:

- `make dev`: starts local Postgres and the Vite dev server
- `make migrate`: applies SQL migrations through the Python migration runner
- `make ingest`: fetches the current-year House Clerk archive, syncs filing metadata, downloads referenced PDFs, parses House PTR trades, links normalized assets, and materializes latest text-based House holdings snapshots
- `make test-ingest`: runs the Python ingest test suite
- `make db-down`: stops local Postgres

## Environment

Current relevant environment variables:

- `DATABASE_URL`
- `DOCUMENT_STORAGE_DIR`
- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_PORT`
- `VITE_APP_NAME`

Default local document storage is:

```text
data/documents/
```

## Current implementation status

Completed foundation:

- repo scaffold for `web`, `ingest`, `db`, and `infra`
- local Docker Compose Postgres workflow
- Python migration runner
- canonical schema for:
  - officials
  - official aliases
  - filings
  - filing documents
  - assets
  - transactions
  - positions
  - position events
  - parse runs
  - parse issues
- `pg_trgm` extension and search-oriented indexes

Current House ingestion behavior:

- fetches the official House Clerk yearly archive at `public_disc/financial-pdfs/{year}FD.zip`
- parses XML metadata records
- upserts:
  - `officials`
  - `official_aliases`
  - `filings`
  - `filing_documents`
- uses stable House-specific `source_ref` values for official dedupe
- persists referenced PDFs under `data/documents/house/{year}/{document_id}.pdf`
- stores `storage_path` and `sha256` on `filing_documents`
- avoids redundant local re-downloads on rerun
- extracts text from House PTR PDFs
- parses PTR transactions into `transactions`
- normalizes House PTR asset identities into canonical `assets`
- links parsed transactions to `transactions.asset_id`
- extracts text from the latest House `candidate_report` / `financial_disclosure_report` PDFs per official
- falls back to OCR for scanned holdings PDFs when local OCR tools are available
- parses Section A holdings into latest disclosed `positions` and `position_events`
- skips image-only or candidate-notice filings with explicit parse issues instead of failing the run
- records `parse_runs` and `parse_issues` for PTR parsing

Validated local state as of 2026-03-21:

- 2026 House sync imported `186` filings across `112` unique officials
- 2026 House sync downloaded `186` PDFs
- local DB contains `186` `filing_documents` rows with non-null `storage_path` and `sha256`
- House PTR parsing currently covers `122` parsed filings and `1244` inserted transactions
- House asset normalization plus holdings parsing currently materialize `801` canonical `assets`
- the latest parse pass has `0` outstanding `parse_issues` on the newest PTR parser runs
- the latest holdings parser runs cover `28` latest disclosure PDFs with `124` materialized snapshot `positions`
- the latest holdings parser skips `4` latest disclosures cleanly, all classified as `candidate_notice_only`

## Current limits

Not implemented yet:

- Senate ingestion
- portfolio reconstruction engine beyond schema design
- public API layer
- real frontend product pages beyond scaffold
- CI/CD to the Oracle VM
- object storage offload for documents/backups

Current House ingest now parses a first-pass holdings snapshot from latest candidate/full disclosure reports, including OCR-backed classification for scanned notice forms. Rich OCR/table extraction for future scanned holdings disclosures is still a likely follow-up.

## Source systems

Current House source:

- index page: `https://disclosures-clerk.house.gov/FinancialDisclosure/ViewSearch`
- yearly archive pattern: `https://disclosures-clerk.house.gov/public_disc/financial-pdfs/{year}FD.zip`

Observed House PDF URL behavior:

- PTR filings use `public_disc/ptr-pdfs/{year}/{doc_id}.pdf`
- other filing types use `public_disc/financial-pdfs/{year}/{doc_id}.pdf`

Known House filing type mappings in code:

- `P` -> `periodic_transaction_report`
- `C` -> `candidate_report`
- `W` -> `withdrawal_notice`
- `X` -> `extension_request`
- unknown codes fall back to `financial_disclosure_report`

## Linear source of truth

Linear project:

- `tradingwithcongress`

Important issues:

- `KHZ-56` Define the canonical disclosure schema and storage model
- `KHZ-57` Build the automated House disclosure ingestion pipeline
- `KHZ-70` Define the platform architecture and deployment topology
- `KHZ-71` Provision Postgres, object storage, backups, and environment management
- `KHZ-72` Build the job orchestration, scheduling, and retry model
- `KHZ-73` Implement Postgres-first search and indexing strategy
- `KHZ-75` Scaffold repository structure for web, ingest, db, and infra
- `KHZ-76` Set up frictionless local development with Docker Compose and hot reload
- `KHZ-77` Provision the Oracle Cloud VM and production Docker host
- `KHZ-78` Implement CI/CD for git-push deployment to the Oracle VM

Current status snapshot:

- `KHZ-75`: done
- `KHZ-76`: done
- `KHZ-56`: done
- `KHZ-57`: in progress

When work changes the actual state of the project, update Linear comments/statuses in the same session.

## Recent implemented milestones

Recent commits already on `master`:

- `7bb17ac` Set up local development infrastructure
- `9f122df` Add database migrations and disclosure schema
- `a74b9c3` Add House filing metadata sync
- `4a26f0a` Add ingest tests and developer commands
- `fd73a25` Persist House filing documents locally
- `00a1edf` Document local filing storage
- `ad0b1a9` Add project handoff documentation
- `5514980` Parse House PTR filings into transactions
- `1d4a467` Document House PTR parsing status
- `f8a8316` ingest: normalize House transaction assets
- `1b6bc4c` docs: update House ingest status
- `f245d4b` ingest: repair PTR page-break parsing
- `3cdebf5` docs: refresh parser handoff status

## Next recommended steps

Immediate next work:

1. Add read models for official and ticker pages.
2. Backfill richer asset typing and issuer normalization beyond the first-pass House canonicalization.
3. Improve OCR/table extraction if future scanned House holdings disclosures appear.
4. Add Senate ingestion after House parsing is stable.

After that:

1. Start portfolio reconstruction and latest-disclosed-position derivation.

## Notes for a new agent session

If you are starting fresh:

1. Read this file.
2. Read `README.md`, `ingest/README.md`, and `infra/README.md`.
3. Inspect current Linear issue states before changing scope.
4. Run:

```bash
make migrate
make test-ingest
make ingest
```

5. Confirm the repo is clean before starting edits.
6. Keep commits small and keep Linear in sync.

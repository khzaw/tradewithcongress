# tradewithcongress

Low-cost congressional disclosure search and visualization project.

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

That sync:
- imports the yearly House Clerk metadata archive
- downloads referenced PDFs into `data/documents/`
- upserts officials, filings, and source document records

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

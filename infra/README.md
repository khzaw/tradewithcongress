# Infrastructure

Read `../PROJECT_CONTEXT.md` first for the broader product and architecture context.

Current deployment target:

- Oracle Cloud Always Free Linux VM
- Docker Compose on the VM

Current container packaging:

- `api/Dockerfile` builds the Bun/Hono read API image
- `web/Dockerfile` builds the Vite frontend and serves it from nginx
- `ingest/Dockerfile` builds the Python/uv ingest image with OCR utilities installed
- `docker-compose.prod.yml` runs Postgres, API, web, one-off migrations, and one-off ingest jobs

Initial host bootstrap flow:

```bash
cp .env.example .env
# set a real POSTGRES_PASSWORD in .env before production use
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml --profile setup run --rm migrate
docker compose -f docker-compose.prod.yml up -d postgres api web
```

One-off ingest jobs can run through the profiled ingest service:

```bash
docker compose -f docker-compose.prod.yml --profile jobs run --rm ingest uv run ingest house-metadata --year 2026
```

Planned deployment model:

- push to `main`
- CI builds and validates artifacts
- production host updates containers with a simple Compose-based rollout

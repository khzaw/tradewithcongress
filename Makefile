SHELL := /bin/bash

.PHONY: bootstrap db-up db-down dev web ingest parse-house migrate test-ingest lint clean

bootstrap:
	cd web && bun install
	cd ingest && uv sync

db-up:
	docker compose up -d postgres

db-down:
	docker compose down

dev: db-up
	./scripts/dev.sh

web:
	./scripts/web.sh

ingest: db-up
	./scripts/ingest.sh

parse-house: db-up
	cd ingest && uv run ingest house-transactions --year $$(date +%Y)

migrate: db-up
	./scripts/migrate.sh

test-ingest: db-up
	cd ingest && uv sync && uv run pytest

lint:
	cd web && bun run lint

clean:
	rm -rf web/node_modules web/dist ingest/.venv postgres-data

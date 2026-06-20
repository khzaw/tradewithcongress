SHELL := /bin/bash

.PHONY: bootstrap db-up db-down dev web api ingest parse-house normalize-assets parse-holdings migrate test-ingest test-api lint docker-build docker-migrate docker-up docker-down clean

bootstrap:
	cd api && bun install
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

api:
	./scripts/api.sh

ingest: db-up
	./scripts/ingest.sh

parse-house: db-up
	cd ingest && uv run ingest house-transactions --year $$(date +%Y)

normalize-assets: db-up
	cd ingest && uv run ingest house-assets --year $$(date +%Y)

parse-holdings: db-up
	cd ingest && uv run ingest house-holdings --year $$(date +%Y)

migrate: db-up
	./scripts/migrate.sh

test-ingest: db-up
	cd ingest && uv sync && uv run pytest

test-api: db-up migrate
	cd api && bun install && bun test

lint:
	cd api && bun run typecheck
	cd web && bun run lint

docker-build:
	docker compose -f docker-compose.prod.yml --profile setup --profile jobs build

docker-migrate:
	docker compose -f docker-compose.prod.yml --profile setup run --rm migrate

docker-up:
	docker compose -f docker-compose.prod.yml up -d postgres api web

docker-down:
	docker compose -f docker-compose.prod.yml down

clean:
	rm -rf api/node_modules web/node_modules web/dist ingest/.venv postgres-data

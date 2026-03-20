SHELL := /bin/bash

.PHONY: bootstrap db-up db-down dev web ingest migrate lint clean

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

migrate: db-up
	./scripts/migrate.sh

lint:
	cd web && bun run lint

clean:
	rm -rf web/node_modules web/dist ingest/.venv postgres-data

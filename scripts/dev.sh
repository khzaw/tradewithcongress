#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ ! -d "$ROOT_DIR/web/node_modules" ]]; then
  echo "Installing web dependencies..."
  (cd "$ROOT_DIR/web" && bun install)
fi

if [[ ! -d "$ROOT_DIR/ingest/.venv" ]]; then
  echo "Installing ingest dependencies..."
  (cd "$ROOT_DIR/ingest" && uv sync)
fi

echo "Starting Vite dev server..."
exec bash "$ROOT_DIR/scripts/web.sh"


#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ ! -d "$ROOT_DIR/api/node_modules" ]]; then
  echo "Installing api dependencies..."
  (cd "$ROOT_DIR/api" && bun install)
fi

if [[ ! -d "$ROOT_DIR/web/node_modules" ]]; then
  echo "Installing web dependencies..."
  (cd "$ROOT_DIR/web" && bun install)
fi

if [[ ! -d "$ROOT_DIR/ingest/.venv" ]]; then
  echo "Installing ingest dependencies..."
  (cd "$ROOT_DIR/ingest" && uv sync)
fi

echo "Starting versioned read API..."
bash "$ROOT_DIR/scripts/api.sh" &
api_pid=$!

cleanup() {
  if kill -0 "$api_pid" >/dev/null 2>&1; then
    kill "$api_pid"
    wait "$api_pid" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

echo "Starting Vite dev server..."
bash "$ROOT_DIR/scripts/web.sh"

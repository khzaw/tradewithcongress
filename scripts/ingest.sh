#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR/ingest"

if [[ $# -eq 0 ]]; then
    uv run ingest house-metadata
    uv run ingest house-transactions
    exec uv run ingest house-assets
fi

exec uv run ingest "$@"

#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

source "$ROOT_DIR/scripts/load-env.sh"

cd "$ROOT_DIR/ingest"

if [[ $# -eq 0 ]]; then
    uv run ingest house-metadata
    uv run ingest house-transactions
    uv run ingest house-assets
    exec uv run ingest house-holdings
fi

exec uv run ingest "$@"

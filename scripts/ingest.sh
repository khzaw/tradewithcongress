#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR/ingest"

if [[ $# -eq 0 ]]; then
    uv run ingest house-metadata
    exec uv run ingest house-transactions
fi

exec uv run ingest "$@"

#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR/ingest"

if [[ $# -eq 0 ]]; then
    exec uv run ingest house-metadata
fi

exec uv run ingest "$@"

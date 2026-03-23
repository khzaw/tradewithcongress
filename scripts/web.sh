#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

source "$ROOT_DIR/scripts/load-env.sh"

cd "$ROOT_DIR/web"
exec bun run dev --host 0.0.0.0

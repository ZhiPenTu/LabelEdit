#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ ! -x .venv/bin/python ]]; then
  bash scripts/setup-backend.sh
fi
.venv/bin/python scripts/build_backend.py "$@"

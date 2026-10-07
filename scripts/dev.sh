#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ ! -x .venv/bin/python ]]; then
  bash scripts/setup-backend.sh
fi
if [[ ! -d node_modules ]]; then
  npm install
fi
.venv/bin/python -m uvicorn backend.server:app --host 127.0.0.1 --port 8765 &
backend_pid=$!
cleanup() { kill "$backend_pid" 2>/dev/null || true; }
trap cleanup EXIT INT TERM
npm run dev -- --host 127.0.0.1 --port 5188 --strictPort

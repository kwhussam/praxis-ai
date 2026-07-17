#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORKER_PID_FILE="$ROOT_DIR/.e2e/worker.pid"

if [[ -f "$WORKER_PID_FILE" ]]; then
  WORKER_PID="$(cat "$WORKER_PID_FILE")"
  if kill -0 "$WORKER_PID" 2>/dev/null; then
    kill "$WORKER_PID"
    wait "$WORKER_PID" 2>/dev/null || true
  fi
  rm -f "$WORKER_PID_FILE"
fi

cd "$ROOT_DIR"
supabase stop
echo "Local E2E environment stopped."

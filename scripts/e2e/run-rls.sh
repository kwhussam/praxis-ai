#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUNTIME_ENV="$ROOT_DIR/.e2e/runtime.env"

if [[ ! -f "$RUNTIME_ENV" ]]; then
  echo "Run npm run e2e:env:up first." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$RUNTIME_ENV"
set +a

cd "$ROOT_DIR"
npm run test:rls

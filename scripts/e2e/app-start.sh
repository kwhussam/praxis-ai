#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUNTIME_ENV="$ROOT_DIR/.e2e/runtime.env"
PLATFORM="${1:-}"
MODE="${2:-run}"

if [[ "$PLATFORM" != "ios" && "$PLATFORM" != "android" ]]; then
  echo "Usage: app-start.sh <ios|android> <run|start>" >&2
  exit 1
fi

if [[ ! -f "$RUNTIME_ENV" ]]; then
  echo "Run npm run e2e:env:up first." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$RUNTIME_ENV"
set +a

if [[ "$PLATFORM" == "android" ]]; then
  APP_SUPABASE_URL="${SUPABASE_URL/127.0.0.1/10.0.2.2}"
  APP_API_BASE_URL="http://10.0.2.2:8787"
else
  APP_SUPABASE_URL="$SUPABASE_URL"
  APP_API_BASE_URL="http://127.0.0.1:8787"
fi

export EXPO_PUBLIC_APP_ENV="test"
export EXPO_PUBLIC_EXTERNAL_CHECK_ENABLED="false"
export EXPO_PUBLIC_SUPABASE_URL="$APP_SUPABASE_URL"
export EXPO_PUBLIC_SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY"
export EXPO_PUBLIC_API_BASE_URL="$APP_API_BASE_URL"

cd "$ROOT_DIR"
if [[ "$MODE" == "run" ]]; then
  npx expo "run:$PLATFORM"
elif [[ "$MODE" == "start" ]]; then
  npx expo start --dev-client --localhost
else
  echo "Usage: app-start.sh <ios|android> <run|start>" >&2
  exit 1
fi

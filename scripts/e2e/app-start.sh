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
export PRAXISSHIELD_ALLOW_LOCAL_CLEARTEXT="1"
export EXPO_PUBLIC_EXTERNAL_CHECK_ENABLED="false"
export EXPO_PUBLIC_SUPABASE_URL="$APP_SUPABASE_URL"
export EXPO_PUBLIC_SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY"
export EXPO_PUBLIC_API_BASE_URL="$APP_API_BASE_URL"

cd "$ROOT_DIR"
if [[ "$MODE" == "run" ]]; then
  # Build and install the native app only. The smoke runner owns Metro so that the bundler
  # always matches the checked-out revision instead of attaching to whatever an implicit
  # bundler left running.
  npx expo "run:$PLATFORM" --no-bundler
elif [[ "$MODE" == "start" ]]; then
  # --host lan binds beyond the loopback interface, which the Android emulator needs to reach
  # the host through 10.0.2.2. iOS still connects via 127.0.0.1.
  npx expo start --dev-client --host lan --port "${E2E_METRO_PORT:-8081}"
else
  echo "Usage: app-start.sh <ios|android> <run|start>" >&2
  exit 1
fi

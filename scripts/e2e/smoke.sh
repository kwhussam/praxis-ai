#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PLATFORM="${1:-ios}"
RUNTIME_ENV="$ROOT_DIR/.e2e/runtime.env"
METRO_PID_FILE="$ROOT_DIR/.e2e/metro.pid"
METRO_LOG="$ROOT_DIR/.e2e/metro.log"
RESULT_FILE="$ROOT_DIR/.maestro/artifacts/results.xml"

if [[ "$PLATFORM" != "ios" && "$PLATFORM" != "android" ]]; then
  echo "Usage: smoke.sh <ios|android>" >&2
  exit 1
fi

cd "$ROOT_DIR"
bash scripts/e2e/env-up.sh

set -a
# shellcheck disable=SC1090
source "$RUNTIME_ENV"
set +a

if [[ "$PLATFORM" == "ios" ]]; then
  if ! xcrun simctl list devices booted | grep -q "(Booted)"; then
    echo "No booted iOS Simulator. Start one before running npm run e2e:smoke." >&2
    exit 1
  fi
  xcrun simctl get_app_container booted ai.praxisshield.app app >/dev/null 2>&1 || {
    echo "Development build is not installed. Run npm run e2e:app:ios first." >&2
    exit 1
  }
elif ! adb get-state >/dev/null 2>&1; then
  echo "No connected Android emulator. Start one before running npm run e2e:smoke:android." >&2
  exit 1
fi

if ! curl --fail --silent --max-time 2 http://127.0.0.1:8081/status | grep -q "packager-status:running"; then
  if [[ -f "$METRO_PID_FILE" ]]; then
    OLD_METRO_PID="$(cat "$METRO_PID_FILE")"
    if kill -0 "$OLD_METRO_PID" 2>/dev/null; then
      kill "$OLD_METRO_PID"
      wait "$OLD_METRO_PID" 2>/dev/null || true
    fi
  fi

  nohup bash scripts/e2e/app-start.sh "$PLATFORM" start > "$METRO_LOG" 2>&1 < /dev/null &
  echo "$!" > "$METRO_PID_FILE"

  for _ in $(seq 1 60); do
    if curl --fail --silent --max-time 2 http://127.0.0.1:8081/status | grep -q "packager-status:running"; then
      break
    fi
    sleep 1
  done
fi

curl --fail --silent --max-time 2 http://127.0.0.1:8081/status | grep -q "packager-status:running" || {
  echo "Metro did not become ready. See $METRO_LOG" >&2
  exit 1
}

mkdir -p "$(dirname "$RESULT_FILE")"
rm -f "$RESULT_FILE"

bash scripts/e2e/maestro.sh test \
  --config=.maestro/config.yaml \
  --format=JUNIT \
  --output="$RESULT_FILE" \
  --platform="$PLATFORM" \
  -e "SUPABASE_URL=$SUPABASE_URL" \
  -e "SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY" \
  -e "SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY" \
  -e "WORKER_URL=http://127.0.0.1:8787" \
  -e "TEST_PASSWORD=$TEST_PRACTICE_A_PASSWORD" \
  .maestro

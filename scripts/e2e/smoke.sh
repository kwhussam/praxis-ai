#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PLATFORM="${1:-ios}"
SUITE="${2:-all}"
RUNTIME_ENV="$ROOT_DIR/.e2e/runtime.env"
METRO_PID_FILE="$ROOT_DIR/.e2e/metro.pid"
METRO_LOG="$ROOT_DIR/.e2e/metro.log"
RESULT_DIR="$ROOT_DIR/.maestro/artifacts/junit"

export MAESTRO_DRIVER_STARTUP_TIMEOUT="${MAESTRO_DRIVER_STARTUP_TIMEOUT:-180000}"

if [[ "$PLATFORM" != "ios" && "$PLATFORM" != "android" ]]; then
  echo "Usage: smoke.sh <ios|android> [all|pdf]" >&2
  exit 1
fi
if [[ "$SUITE" != "all" && "$SUITE" != "pdf" ]]; then
  echo "Usage: smoke.sh <ios|android> [all|pdf]" >&2
  exit 1
fi

cd "$ROOT_DIR"
bash scripts/e2e/env-up.sh

set -a
# shellcheck disable=SC1090
source "$RUNTIME_ENV"
set +a

# Flow 15 is part of both suites and requires the same canonical manifest/report
# fixture. Seed it for the full smoke as well as the focused PDF smoke.
node scripts/e2e/seed-canonical-report.mjs

if [[ "$PLATFORM" == "ios" ]]; then
  if ! xcrun simctl list devices booted | grep -q "(Booted)"; then
    echo "No booted iOS Simulator. Start one before running npm run e2e:smoke." >&2
    exit 1
  fi
  xcrun simctl get_app_container booted ai.praxisshield.app app >/dev/null 2>&1 || {
    echo "Development build is not installed. Run npm run e2e:app:ios first." >&2
    exit 1
  }
  DEV_CLIENT_URL="ai.praxisshield.app://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081"
elif ! adb get-state >/dev/null 2>&1; then
  echo "No connected Android emulator. Start one before running npm run e2e:smoke:android." >&2
  exit 1
else
  DEV_CLIENT_URL="ai.praxisshield.app://expo-development-client/?url=http%3A%2F%2F10.0.2.2%3A8081"
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

cd "$ROOT_DIR/.maestro"
MAESTRO_CONFIG="$ROOT_DIR/.maestro/smoke-config.yaml"
shopt -s nullglob
MAESTRO_TARGETS=(flows/*.yaml)
if [[ "$SUITE" == "pdf" ]]; then
  MAESTRO_TARGETS=(flows/15-pdf-export.yaml)
fi

if [[ "${#MAESTRO_TARGETS[@]}" -eq 0 ]]; then
  echo "No Maestro flows found for suite $SUITE." >&2
  exit 1
fi

mkdir -p "$RESULT_DIR"
RESULT_FILES=()
MAESTRO_COMMAND_FAILED=false

# Maestro's multi-file execution planner can resolve a valid workspace to zero
# flows on the pinned CLI version. Execute the sorted, explicit files one by one:
# this is deterministic, serial and still records every failure before gating.
for MAESTRO_TARGET in "${MAESTRO_TARGETS[@]}"; do
  FLOW_NAME="$(basename "$MAESTRO_TARGET" .yaml)"
  RESULT_FILE="$RESULT_DIR/$FLOW_NAME.xml"
  rm -f "$RESULT_FILE"
  RESULT_FILES+=("$RESULT_FILE")

  if ! bash "$ROOT_DIR/scripts/e2e/maestro.sh" test \
    --config="$MAESTRO_CONFIG" \
    --format=JUNIT \
    --output="$RESULT_FILE" \
    --platform="$PLATFORM" \
    -e "SUPABASE_URL=$SUPABASE_URL" \
    -e "SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY" \
    -e "SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY" \
    -e "WORKER_URL=http://127.0.0.1:8787" \
    -e "TEST_PASSWORD=$TEST_PRACTICE_A_PASSWORD" \
    -e "DEV_CLIENT_URL=$DEV_CLIENT_URL" \
    -e "SCREENSHOT_VARIANT=${PLATFORM}-smoke" \
    "$MAESTRO_TARGET"; then
    MAESTRO_COMMAND_FAILED=true
  fi
done

# Maestro exit codes are not sufficient when workspace continue-on-failure is
# used elsewhere. The complete set of fail-closed JUnit reports is authoritative.
node "$ROOT_DIR/scripts/e2e/assert-maestro-results.mjs" "${RESULT_FILES[@]}"
if [[ "$MAESTRO_COMMAND_FAILED" == "true" ]]; then
  echo "At least one Maestro command failed despite a successful JUnit gate." >&2
  exit 1
fi

if [[ "$SUITE" == "pdf" && "$PLATFORM" == "ios" ]]; then
  APP_DATA_CONTAINER="$(xcrun simctl get_app_container booted ai.praxisshield.app data)"
  if find "$APP_DATA_CONTAINER/Library/Caches" -name 'PraxisShield-Bericht-*.pdf' -print | grep -q .; then
    echo "Plaintext PDF remained in the iOS cache after the native share dialog closed." >&2
    exit 1
  fi
elif [[ "$SUITE" == "pdf" ]]; then
  ANDROID_CACHE_FILES="$(adb shell run-as ai.praxisshield.app find cache -name 'PraxisShield-Bericht-*.pdf' -print 2>/dev/null || true)"
  if [[ -n "$ANDROID_CACHE_FILES" ]]; then
    echo "Plaintext PDF remained in the Android cache after the native share dialog closed." >&2
    exit 1
  fi
fi

if [[ "$SUITE" == "pdf" ]]; then
  echo "Native $PLATFORM PDF open/share and plaintext-cache cleanup smoke passed."
fi

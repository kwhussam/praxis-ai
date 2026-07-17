#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STATE_DIR="$ROOT_DIR/.e2e"
STATUS_ENV="$STATE_DIR/supabase-status.env"
RUNTIME_ENV="$STATE_DIR/runtime.env"
WORKER_PID_FILE="$STATE_DIR/worker.pid"
WORKER_LOG="$STATE_DIR/worker.log"
EXPECTED_MIGRATIONS="$STATE_DIR/expected-migrations.txt"
APPLIED_MIGRATIONS="$STATE_DIR/applied-migrations.txt"

mkdir -p "$STATE_DIR"
umask 077

command -v docker >/dev/null || {
  echo "Docker is required for the local Supabase stack." >&2
  exit 1
}
command -v supabase >/dev/null || {
  echo "Supabase CLI is required. Install version 2.109.1 or newer." >&2
  exit 1
}

docker info >/dev/null

cd "$ROOT_DIR"
PROJECT_ID="$(sed -n 's/^project_id = "\(.*\)"/\1/p' supabase/config.toml)"
find supabase/migrations -maxdepth 1 -name '*.sql' -print |
  sed 's#.*/##; s/_.*$//' |
  sort > "$EXPECTED_MIGRATIONS"

container_id() {
  docker ps -q \
    --filter "label=com.supabase.cli.project=$PROJECT_ID" \
    --filter "name=$1" |
    head -n 1
}

wait_for_healthy_container() {
  local container="$1"

  for _ in $(seq 1 180); do
    if [[ "$(docker inspect --format '{{.State.Health.Status}}' "$container")" == "healthy" ]]; then
      return 0
    fi
    sleep 2
  done

  return 1
}

migrations_match_repository() {
  local container="$1"

  docker exec "$container" \
    psql -U postgres -d postgres -Atc \
    'select version from supabase_migrations.schema_migrations order by version' \
    > "$APPLIED_MIGRATIONS" 2>/dev/null &&
    cmp -s "$EXPECTED_MIGRATIONS" "$APPLIED_MIGRATIONS"
}

if ! supabase start; then
  echo "Supabase start reported an unhealthy container; the reset will verify the local stack." >&2
fi

RESET_COMPLETE=false
for ATTEMPT in 1 2; do
  if supabase db reset; then
    RESET_COMPLETE=true
    break
  fi

  echo "Supabase reset attempt $ATTEMPT reported an unhealthy container; verifying its progress." >&2
  DB_CONTAINER="$(container_id supabase_db_)"
  if [[ -n "$DB_CONTAINER" ]] &&
     wait_for_healthy_container "$DB_CONTAINER" &&
     migrations_match_repository "$DB_CONTAINER"; then
    RESET_COMPLETE=true
    break
  fi

  if [[ "$ATTEMPT" -lt 2 ]]; then
    echo "Project migrations are incomplete; retrying the database reset once." >&2
  fi
done

if [[ "$RESET_COMPLETE" != "true" ]]; then
  echo "Supabase database reset did not complete after two attempts." >&2
  exit 1
fi

DB_CONTAINER="$(container_id supabase_db_)"
STORAGE_CONTAINER="$(container_id supabase_storage_)"

if [[ -z "$DB_CONTAINER" || -z "$STORAGE_CONTAINER" ]]; then
  echo "Supabase reset did not leave the database and storage containers running." >&2
  exit 1
fi

if ! wait_for_healthy_container "$DB_CONTAINER" ||
   ! wait_for_healthy_container "$STORAGE_CONTAINER"; then
  echo "Supabase containers did not become healthy after the reset." >&2
  exit 1
fi

docker exec "$DB_CONTAINER" \
  psql -U postgres -d postgres -Atc \
  'select version from supabase_migrations.schema_migrations order by version' \
  > "$APPLIED_MIGRATIONS"

if ! diff -u "$EXPECTED_MIGRATIONS" "$APPLIED_MIGRATIONS"; then
  echo "The applied Supabase migrations do not match the repository." >&2
  exit 1
fi

supabase status -o env > "$STATUS_ENV"

set -a
# shellcheck disable=SC1090
source "$STATUS_ENV"
set +a

LOCAL_SUPABASE_URL="${API_URL:-http://127.0.0.1:54321}"
LOCAL_SUPABASE_ANON_KEY="${ANON_KEY:-${PUBLISHABLE_KEY:-}}"
LOCAL_SUPABASE_SERVICE_ROLE_KEY="${SERVICE_ROLE_KEY:-${SECRET_KEY:-}}"

if [[ -z "$LOCAL_SUPABASE_ANON_KEY" || -z "$LOCAL_SUPABASE_SERVICE_ROLE_KEY" ]]; then
  echo "Supabase status did not expose local anon/service-role keys." >&2
  exit 1
fi

{
  printf 'export SUPABASE_URL=%q\n' "$LOCAL_SUPABASE_URL"
  printf 'export SUPABASE_ANON_KEY=%q\n' "$LOCAL_SUPABASE_ANON_KEY"
  printf 'export SUPABASE_SERVICE_ROLE_KEY=%q\n' "$LOCAL_SUPABASE_SERVICE_ROLE_KEY"
  printf 'export TEST_PRACTICE_A_EMAIL=%q\n' "owner-a@example.test"
  printf 'export TEST_PRACTICE_A_PASSWORD=%q\n' "Local-E2E-2026!"
  printf 'export TEST_PRACTICE_B_ID=%q\n' "20000000-0000-4000-8000-0000000000b1"
} > "$RUNTIME_ENV"

set -a
# shellcheck disable=SC1090
source "$RUNTIME_ENV"
set +a

node scripts/e2e/verify-seed.mjs

if [[ -f "$WORKER_PID_FILE" ]]; then
  OLD_PID="$(cat "$WORKER_PID_FILE")"
  if kill -0 "$OLD_PID" 2>/dev/null; then
    kill "$OLD_PID"
    wait "$OLD_PID" 2>/dev/null || true
  fi
  rm -f "$WORKER_PID_FILE"
fi

nohup npx wrangler dev \
  --config workers/hono/wrangler.toml \
  --ip 0.0.0.0 \
  --port 8787 \
  --var "APP_ENV:test" \
  --var "ANTHROPIC_API_KEY:local-e2e-disabled" \
  --var "SUPABASE_URL:$SUPABASE_URL" \
  --var "SUPABASE_ANON_KEY:$SUPABASE_ANON_KEY" \
  --var "SUPABASE_SERVICE_ROLE_KEY:$SUPABASE_SERVICE_ROLE_KEY" \
  > "$WORKER_LOG" 2>&1 < /dev/null &
WORKER_PID=$!
echo "$WORKER_PID" > "$WORKER_PID_FILE"

for _ in $(seq 1 30); do
  if curl --fail --silent http://127.0.0.1:8787/health >/dev/null; then
    echo "E2E environment is ready."
    echo "Supabase: http://127.0.0.1:54321"
    echo "Worker:   http://127.0.0.1:8787"
    echo "Studio:   http://127.0.0.1:54323"
    echo "Mailpit:  http://127.0.0.1:54324"
    echo "Runtime:  $RUNTIME_ENV"
    exit 0
  fi
  sleep 1
done

echo "Worker did not become healthy. See $WORKER_LOG" >&2
exit 1

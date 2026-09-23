#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PROJECT_ID="$(sed -n 's/^project_id = "\(.*\)"/\1/p' "$ROOT_DIR/supabase/config.toml")"
SOURCE_DB="postgres"
TARGET_DB="praxisshield_recovery_${$}"
TEST_DATA_KEY="0000000000000000000000000000000000000000000000000000000000000000"
ARTIFACT_DIR="$ROOT_DIR/artifacts/recovery"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$(git -C "$ROOT_DIR" rev-parse --short=12 HEAD)"
REPORT_PATH="$ARTIFACT_DIR/$RUN_ID.json"
WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/praxisshield-recovery.XXXXXX")"
STATUS_FILE="$WORK_DIR/checks.tsv"
TARGET_CREATED=false
DB_CONTAINER=""
CONTAINER_DUMP="/tmp/$TARGET_DB.dump"
CONTAINER_RESTORE_LIST="/tmp/$TARGET_DB.restore.list"

cleanup() {
  if [[ "$TARGET_CREATED" == "true" && -n "$DB_CONTAINER" && "$TARGET_DB" =~ ^praxisshield_recovery_[0-9]+$ ]]; then
    docker exec "$DB_CONTAINER" dropdb -U postgres --if-exists --force "$TARGET_DB" >/dev/null 2>&1 || true
  fi
  if [[ -n "$DB_CONTAINER" && "$TARGET_DB" =~ ^praxisshield_recovery_[0-9]+$ ]]; then
    docker exec "$DB_CONTAINER" rm -f "$CONTAINER_DUMP" "$CONTAINER_RESTORE_LIST" >/dev/null 2>&1 || true
  fi
  find "$WORK_DIR" -type f -delete 2>/dev/null || true
  find "$WORK_DIR" -depth -type d -empty -delete 2>/dev/null || true
}
trap cleanup EXIT

fail() {
  echo "Recovery drill refused: $*" >&2
  exit 1
}

record() {
  local id="$1"
  local status="$2"
  local error_class="${3:-none}"
  printf '%s\t%s\t%s\n' "$id" "$status" "$error_class" >> "$STATUS_FILE"
  printf '%-4s %s%s\n' "$id" "$status" "$([[ "$error_class" == "none" ]] && printf '' || printf ' (%s)' "$error_class")"
}

source_psql() {
  docker exec -i "$DB_CONTAINER" psql -X -v ON_ERROR_STOP=1 -U postgres -d "$SOURCE_DB" "$@"
}

target_psql() {
  docker exec -i "$DB_CONTAINER" psql -X -v ON_ERROR_STOP=1 -U postgres -d "$TARGET_DB" "$@"
}

command -v docker >/dev/null || fail "Docker is required."
command -v supabase >/dev/null || fail "Supabase CLI is required."
command -v node >/dev/null || fail "Node.js is required."
[[ "$PROJECT_ID" == "Praxis-AI" ]] || fail "unexpected Supabase project_id '$PROJECT_ID'"
[[ "$(sed -n 's/^port = \([0-9][0-9]*\)$/\1/p' "$ROOT_DIR/supabase/config.toml" | head -n 1)" == "54321" ]] ||
  fail "the source API must remain bound to the repository-local port 54321"
[[ "$TARGET_DB" =~ ^praxisshield_recovery_[0-9]+$ ]] || fail "unsafe target database name"

docker info >/dev/null || fail "Docker daemon is unavailable."
mkdir -p "$ARTIFACT_DIR"
umask 077
: > "$STATUS_FILE"

cd "$ROOT_DIR"
echo "Resetting the repository-local Supabase stack to its synthetic seed ..."
supabase start >/dev/null
supabase db reset --local >/dev/null

DB_CONTAINER="$(docker ps -q \
  --filter "label=com.supabase.cli.project=$PROJECT_ID" \
  --filter 'name=supabase_db_' | head -n 1)"
[[ -n "$DB_CONTAINER" ]] || fail "repository-local Supabase database container was not found"

STATUS_ENV="$WORK_DIR/supabase-status.env"
supabase status -o env > "$STATUS_ENV"
set -a
# shellcheck disable=SC1090
source "$STATUS_ENV"
set +a
LOCAL_API_URL="${API_URL:-}"
LOCAL_SERVICE_KEY="${SERVICE_ROLE_KEY:-${SECRET_KEY:-}}"
[[ "$LOCAL_API_URL" == "http://127.0.0.1:54321" ]] || fail "source API is not the expected loopback endpoint"
[[ -n "$LOCAL_SERVICE_KEY" ]] || fail "local service-role key was not returned by Supabase"

SYNTHETIC_OK="$(source_psql -Atc "
  select (
    count(*) >= 2
    and bool_and((domain is null or domain like '%.example.test') and (email is null or email like '%@example.test'))
    and count(*) filter (where id in (
      '20000000-0000-4000-8000-0000000000a1'::uuid,
      '20000000-0000-4000-8000-0000000000b1'::uuid
    )) = 2
  ) from public.practices;
")"
[[ "$SYNTHETIC_OK" == "t" ]] || fail "source contains data outside the approved synthetic tenant fixture"

SUPABASE_URL="$LOCAL_API_URL" \
SUPABASE_SERVICE_ROLE_KEY="$LOCAL_SERVICE_KEY" \
DATA_ENCRYPTION_KEY="$TEST_DATA_KEY" \
  node scripts/e2e/seed-canonical-report.mjs >/dev/null
source_psql < scripts/recovery/fixture.sql >/dev/null

SOURCE_SECURITY="$WORK_DIR/source-security.json"
TARGET_SECURITY="$WORK_DIR/target-security.json"
SOURCE_ARTIFACT="$WORK_DIR/source-report.json"
TARGET_ARTIFACT="$WORK_DIR/target-report.json"
SOURCE_HASHES="$WORK_DIR/source-hashes.json"
TARGET_HASHES="$WORK_DIR/target-hashes.json"
DUMP_PATH="$WORK_DIR/source.dump"
RESTORE_LIST="$WORK_DIR/restore.list"

source_psql -At < scripts/recovery/security-snapshot.sql > "$SOURCE_SECURITY"
source_psql -At < scripts/recovery/report-artifact.sql > "$SOURCE_ARTIFACT"
RECOVERY_TEST_DATA_KEY="$TEST_DATA_KEY" \
  node --experimental-strip-types scripts/recovery/verify-report-artifact.mjs \
  "$SOURCE_ARTIFACT" "$SOURCE_HASHES"

T_BASELINE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
BACKUP_STARTED_NS="$(date +%s%N)"
docker exec "$DB_CONTAINER" pg_dump -U postgres -d "$SOURCE_DB" -Fc --no-owner \
  --schema=public --schema=auth --schema=storage --schema=supabase_migrations > "$DUMP_PATH"
docker cp "$DUMP_PATH" "$DB_CONTAINER:$CONTAINER_DUMP"
docker exec "$DB_CONTAINER" pg_restore -l "$CONTAINER_DUMP" |
  awk '$0 !~ /DEFAULT ACL/ { print }' > "$RESTORE_LIST"
docker cp "$RESTORE_LIST" "$DB_CONTAINER:$CONTAINER_RESTORE_LIST"
T_BACKUP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
BACKUP_ENDED_NS="$(date +%s%N)"
[[ -s "$DUMP_PATH" ]] || fail "logical dump is empty"

docker exec "$DB_CONTAINER" createdb -U postgres --template=template0 "$TARGET_DB"
TARGET_CREATED=true
docker exec "$DB_CONTAINER" psql -X -v ON_ERROR_STOP=1 -U postgres -d "$TARGET_DB" \
  -c 'drop schema public cascade; create schema extensions; grant usage on schema extensions to anon, authenticated, service_role; create extension pgcrypto with schema extensions; create extension "uuid-ossp" with schema extensions;' >/dev/null
T_RESTORE_START="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
RESTORE_STARTED_NS="$(date +%s%N)"
docker exec "$DB_CONTAINER" pg_restore -U postgres -d "$TARGET_DB" \
  --exit-on-error --no-owner --use-list="$CONTAINER_RESTORE_LIST" "$CONTAINER_DUMP"
RESTORE_ENDED_NS="$(date +%s%N)"
T_RESTORE_END="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

EXPECTED_MIGRATIONS="$WORK_DIR/expected-migrations.txt"
TARGET_MIGRATIONS="$WORK_DIR/target-migrations.txt"
find supabase/migrations -maxdepth 1 -name '*.sql' -print |
  sed 's#.*/##; s/_.*$//' | sort > "$EXPECTED_MIGRATIONS"
target_psql -Atc 'select version from supabase_migrations.schema_migrations order by version' > "$TARGET_MIGRATIONS"
if cmp -s "$EXPECTED_MIGRATIONS" "$TARGET_MIGRATIONS"; then
  record P-01 pass
else
  record P-01 fail migration_mismatch
fi

if supabase db test --db-url "postgresql://postgres:postgres@127.0.0.1:54322/$TARGET_DB" supabase/tests \
  > "$WORK_DIR/pgtap.log" 2>&1; then
  record P-02 pass
else
  record P-02 fail pgtap_failure
  tail -n 30 "$WORK_DIR/pgtap.log" >&2
fi

target_psql -At < scripts/recovery/security-snapshot.sql > "$TARGET_SECURITY"
FORCED_RLS_COUNT="$(target_psql -Atc "
  select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity and c.relforcerowsecurity;
")"
PUBLIC_TABLE_COUNT="$(target_psql -Atc "
  select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r';
")"
if cmp -s "$SOURCE_SECURITY" "$TARGET_SECURITY" && [[ "$FORCED_RLS_COUNT" == "40" && "$PUBLIC_TABLE_COUNT" == "40" ]]; then
  record P-03 pass
else
  record P-03 fail security_state_mismatch
  diff -u "$SOURCE_SECURITY" "$TARGET_SECURITY" | head -n 120 >&2 || true
fi

target_psql -At < scripts/recovery/report-artifact.sql > "$TARGET_ARTIFACT"
if RECOVERY_TEST_DATA_KEY="$TEST_DATA_KEY" \
  node --experimental-strip-types scripts/recovery/verify-report-artifact.mjs \
  "$TARGET_ARTIFACT" "$TARGET_HASHES" && cmp -s "$SOURCE_HASHES" "$TARGET_HASHES"; then
  record P-04 pass
else
  record P-04 fail canonical_artifact_mismatch
fi

CONSENT_DPA_OK="$(target_psql -Atc "
  with chain as (
    select id, supersedes_id, row_number() over (order by accepted_at, created_at, id) as seq
    from public.consent_log
    where practice_id = '20000000-0000-4000-8000-0000000000a1'
      and type = 'wlan_scan' and version like 'sp3-02-%'
  ), checked as (
    select count(*) = 3
      and bool_and(case seq
        when 1 then id = 'b3200000-0000-4000-8000-000000000701'::uuid and supersedes_id is null
        when 2 then id = 'b3200000-0000-4000-8000-000000000702'::uuid
          and supersedes_id = 'b3200000-0000-4000-8000-000000000701'::uuid
        when 3 then id = 'b3200000-0000-4000-8000-000000000703'::uuid
          and supersedes_id = 'b3200000-0000-4000-8000-000000000702'::uuid
        else false
      end) as ok
    from chain
  )
  select checked.ok and exists (
    select 1 from public.data_processing_agreements
    where id = 'b3200000-0000-4000-8000-0000000000a1'
      and accepted_at = '2026-09-16T08:00:00Z'::timestamptz
  ) from checked;
")"
if [[ "$CONSENT_DPA_OK" == "t" ]]; then
  record P-05 pass
else
  record P-05 fail consent_or_audit_chain_broken
fi

DELETION_OK="$(target_psql -Atc "
  select
    exists (
      select 1 from public.practices
      where id = '20000000-0000-4000-8000-0000000000b1'
        and deleted_at is not null and name = '[GELOESCHT]' and domain is null and email is null
    )
    and exists (
      select 1 from public.deletion_requests
      where practice_id = '20000000-0000-4000-8000-0000000000b1'
        and status = 'completed' and state = 'completed'
    )
    and not exists (select 1 from public.wlan_scans where practice_id = '20000000-0000-4000-8000-0000000000b1')
    and not exists (select 1 from public.assessment_snapshots where practice_id = '20000000-0000-4000-8000-0000000000b1')
    and not exists (select 1 from public.assessment_manifests where practice_id = '20000000-0000-4000-8000-0000000000b1')
    and not exists (select 1 from public.scan_authorizations where practice_id = '20000000-0000-4000-8000-0000000000b1')
    and not exists (select 1 from public.scan_kill_switch_events where practice_id = '20000000-0000-4000-8000-0000000000b1')
    and exists (
      select 1
      from public.assessment_snapshots s
      join public.assessment_snapshot_components c on c.snapshot_id = s.id and c.practice_id = s.practice_id
      join public.assessment_snapshot_score_explanations e on e.snapshot_id = s.id and e.practice_id = s.practice_id
      where s.id = 'c3300000-0000-4000-8000-0000000000a1'
        and s.practice_id = '20000000-0000-4000-8000-0000000000a1'
        and s.payload_sha256 = repeat('a', 64)
        and c.payload_sha256 = repeat('1', 64)
        and e.code = 'fixture.recovery'
    )
    and exists (
      select 1
      from public.scan_authorizations a
      join public.scan_authorization_events e
        on e.authorization_id = a.id and e.practice_id = a.practice_id
      where a.id = 'd4400000-0000-4000-8000-0000000000a1'
        and a.practice_id = '20000000-0000-4000-8000-0000000000a1'
        and a.scope_sha256 = repeat('a', 64)
        and a.encrypted_scope ->> 'alg' = 'AES-256-GCM'
        and e.event_type = 'granted'
    )
    and exists (
      select 1 from public.scan_kill_switch_events
      where practice_id = '20000000-0000-4000-8000-0000000000a1'
        and enabled = false and reason_code = 'recovery_fixture_initial_state'
    )
    and not exists (
      select 1 from (
        select practice_id from public.inventory_items
        union all select practice_id from public.inventory_known_devices
        union all select practice_id from public.inventory_access_points
        union all select practice_id from public.router_wifi_configurations
        union all select practice_id from public.router_firewall_rules
        union all select practice_id from public.monitoring_targets
      ) retained where retained.practice_id = '20000000-0000-4000-8000-0000000000b1'
    );
")"
if [[ "$DELETION_OK" == "t" ]]; then
  record P-06 pass
else
  record P-06 fail completed_deletion_not_enforced
fi

TENANT_AUTH_OK="$(target_psql -Atc "
  select
    extensions.crypt('LocalE2E2026Secure', encrypted_password) = encrypted_password
    from auth.users where id = '00000000-0000-4000-8000-0000000000a1';
")"
RLS_A_RESULT="$(target_psql -Atc "
  begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);
  select jsonb_build_object(
    'own', count(*) filter (where practice_id = '20000000-0000-4000-8000-0000000000a1'),
    'foreign', count(*) filter (where practice_id = '20000000-0000-4000-8000-0000000000b1')
  ) from public.security_checks;
  rollback;
" | awk '/^\{/{line=$0} END{print line}')"
RLS_OUTSIDER_RESULT="$(target_psql -Atc "
  begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000f1', true);
  select count(*) from public.security_checks;
  rollback;
" | awk '/^[0-9]+$/{line=$0} END{print line}')"
if [[ "$TENANT_AUTH_OK" == "t" && "$RLS_A_RESULT" == '{"own": 1, "foreign": 0}' && "$RLS_OUTSIDER_RESULT" == "0" ]]; then
  record P-07 pass
else
  record P-07 fail tenant_or_auth_restore_failure
fi

if env -u RECOVERY_TEST_DATA_KEY \
  node --experimental-strip-types scripts/recovery/verify-report-artifact.mjs \
  "$TARGET_ARTIFACT" "$WORK_DIR/missing-key-output.json" > "$WORK_DIR/missing-key.log" 2>&1; then
  record P-08 fail missing_key_accepted
elif [[ -e "$WORK_DIR/missing-key-output.json" ]]; then
  record P-08 fail plaintext_or_empty_fallback_written
else
  record P-08 pass
fi

BACKUP_DURATION_MS="$(( (BACKUP_ENDED_NS - BACKUP_STARTED_NS) / 1000000 ))"
RESTORE_DURATION_MS="$(( (RESTORE_ENDED_NS - RESTORE_STARTED_NS) / 1000000 ))"
COMMIT_SHA="$(git rev-parse HEAD)"
MIGRATION_VERSION="$(tail -n 1 "$TARGET_MIGRATIONS")"
DOCKER_VERSION="$(docker --version | sed 's/"/\\"/g')"
SUPABASE_VERSION="$(supabase --version | tr -d '\n' | sed 's/"/\\"/g')"
PASS_COUNT="$(awk -F '\t' '$2 == "pass" {count++} END {print count+0}' "$STATUS_FILE")"
FAIL_COUNT="$(awk -F '\t' '$2 == "fail" {count++} END {print count+0}' "$STATUS_FILE")"
CHECKS_JSON="$(awk -F '\t' '
  BEGIN { printf "[" }
  { if (NR > 1) printf ","; printf "{\"id\":\"%s\",\"status\":\"%s\",\"error_class\":\"%s\"}", $1, $2, $3 }
  END { printf "]" }
' "$STATUS_FILE")"
HASHES_JSON="$(tr -d '\n ' < "$TARGET_HASHES")"

cat > "$REPORT_PATH" <<EOF
{
  "schema_version": "sp3-02.phase-b.v1",
  "run_id": "$RUN_ID",
  "commit_sha": "$COMMIT_SHA",
  "environment": "local-synthetic-isolated-database",
  "migration_version": "$MIGRATION_VERSION",
  "tools": {
    "docker": "$DOCKER_VERSION",
    "supabase_cli": "$SUPABASE_VERSION"
  },
  "timestamps": {
    "baseline": "$T_BASELINE",
    "backup": "$T_BACKUP",
    "restore_start": "$T_RESTORE_START",
    "restore_end": "$T_RESTORE_END"
  },
  "measurements": {
    "backup_duration_ms": $BACKUP_DURATION_MS,
    "restore_duration_ms": $RESTORE_DURATION_MS,
    "local_snapshot_rpo_seconds": 0,
    "production_claim": false
  },
  "canonical_artifact_hashes": $HASHES_JSON,
  "summary": { "passed": $PASS_COUNT, "failed": $FAIL_COUNT },
  "checks": $CHECKS_JSON
}
EOF
chmod 600 "$REPORT_PATH"

echo "Evidence: $REPORT_PATH"
if [[ "$FAIL_COUNT" -gt 0 ]]; then
  echo "Recovery drill detected $FAIL_COUNT blocking finding(s)." >&2
  exit 1
fi
echo "Recovery drill passed all eight checks."

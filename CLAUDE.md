# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

PraxisShield AI — an Expo/React Native mobile app for cybersecurity checks, GDPR-oriented security documentation, and continuous monitoring for German medical practices (Arztpraxen). It combines a questionnaire, local WLAN/network scans, external domain checks, and AI-generated reports into a security score for practice owners and IT partners.

## Commands

```bash
npm run start              # Start Expo dev server
npm run ios / npm run android / npm run web

npm run lint                # eslint . --max-warnings=0
npm run typecheck           # tsc --noEmit
npm test                    # jest (all tests)
npm run verify               # lint + typecheck + test (what CI runs as "quality")

npm run test:unit           # jest lib/security/__tests__
npm run test:worker         # jest workers/hono/__tests__
npm run test:rls            # jest supabase/__tests__ --runInBand
npm run test:secrets        # jest security/__tests__/secret-exposure.test.ts

npx jest path/to/file.test.ts              # run a single test file
npx jest -t "test name substring"          # run a single test by name

npm run workers:dev         # wrangler dev for the Cloudflare Worker (local API)
npm run supabase:types      # regenerate lib/api/database.types.ts from local Supabase schema
```

CI (`.github/workflows/ci.yml`) has two jobs: `quality` (npm ci → gitleaks secret scan → `npm run verify` against a test Supabase project) and `rls-pgtap` (spins up local Supabase via `supabase start`, runs `supabase db test --local supabase/tests/rls_cross_tenant.sql`). Match these locally before assuming a change is CI-green.

### Local Supabase / Worker / E2E

Full instructions in `docs/E2E_LOCAL_SETUP.md`. Summary:

```bash
supabase db reset            # reapply all migrations + seed
npm run e2e:env:up           # start local Supabase, reset db, seed, start Worker on :8787
npm run e2e:env:down
npm run e2e:smoke            # ios Maestro smoke suite (requires a dev build, not Expo Go)
npm run e2e:smoke:android
```

Maestro flows live in `.maestro/flows/`, reusable fragments in `.maestro/subflows/`, generated artifacts in `.maestro/artifacts/` (gitignored). A native dev build is required — Expo Go lacks the custom native WLAN/network modules (`react-native-wifi-reborn`, custom probes), so Maestro must drive the real bundle (`ai.praxisshield.app`).

## Architecture

Three separate runtime boundaries — keep logic in the right one:

1. **Mobile app (Expo Router, `app/`)** — owns UI, local scan orchestration, haptics, push registration, offline/optimistic state. Auth session persists via Expo SecureStore (`lib/store/secureAuthStorage.ts`); MMKV (`lib/store/storage.ts`) is for non-sensitive caches only — never put tokens or PII in MMKV.
2. **Supabase** — auth, relational practice data, reports, checks, monitoring events/snapshots, WLAN scans, consent/audit logs. Row Level Security is the tenant boundary: practice data is scoped by `owner_id`, with partner access modeled via `white_label_partner_id` on `practices` and `partner_practices` role grants. Any new table needs RLS policies before it's usable — see `supabase/tests/rls_cross_tenant.sql` and `docs/RLS_PARTNER_ROLE_MATRIX.md`.
3. **Cloudflare Worker (`workers/hono/src/`, Hono.js)** — the only place third-party security provider keys (SecurityTrails, Shodan, HIBP, MXToolbox, VirusTotal, SSL Labs, Cloudflare DNS) and the Anthropic key live. The mobile app never talks to these providers directly; it calls the Worker's `/api/*` endpoints, which normalize provider responses into PraxisShield findings before scoring/report generation. Only `EXPO_PUBLIC_*` env vars are safe to reference from app code — everything else is server-only.

Data flow: questionnaire + local scans → provisional score in Zustand (`lib/store/`) → external checks via Worker → findings persisted to `security_checks` → scoring (`lib/security/scoring.ts`) → reports (`lib/ai/`) linked via `reports.check_id` → monitoring events/snapshots written to Supabase → Realtime pushes updates into the Monitoring tab.

### Scoring & evidence model

`lib/security/scoring.ts` is a rule-based, versioned scoring engine across categories (`access_control`, `backup`, `email_security`, `network`, `dsgvo`, `updates`). Every finding also carries an **evidence coverage** tag — `measured`, `inferred`, `self_reported`, `not_checked`, or `unavailable` — reflecting how reliable the underlying data source is. Untested areas must be marked `not_checked`/`unavailable`, never silently treated as passing. Score bands: green ≥75, yellow ≥50, red <50. Provider integration status is similarly explicit: `active`, `not_configured`, or `unavailable` (a missing API key is "not checked," not "no risk"). Full detail in `docs/SCORING.md`.

### Directory map

```
app/(auth)/                  Welcome, login, onboarding
app/(tabs)/dashboard/        Security dashboard (score, findings, history)
app/(tabs)/check/            Questionnaire, WLAN scan, check flow
app/(tabs)/inventory/        Practice inventory (devices, APs, domains, providers)
app/(tabs)/monitoring/       Realtime monitoring + manual scans
app/(tabs)/report/           AI reports + detail views
components/ui/               Design system
components/charts/           Score/history/risk visualizations
components/modules/          Feature modules for checks/findings/reports
lib/security/                Scoring engine + all network/WLAN/DNS assessment logic
lib/ai/                      Report schema, AI client, PDF export
lib/api/                     Supabase + Worker API clients
lib/inventory/                Inventory logic, rogue device/AP detection
lib/monitoring/               Monitoring service, types, notifications
lib/store/                   Zustand stores (check, inventory, report, session)
lib/billing/                 Plans and white-label types
workers/hono/src/            Cloudflare Worker (external providers, AI reports, privacy endpoints)
supabase/migrations/         Schema migrations
supabase/tests/              pgTAP RLS tests
docs/                        ARCHITECTURE.md, SCORING.md, INVENTORY.md, E2E_LOCAL_SETUP.md, RLS_PARTNER_ROLE_MATRIX.md
```

## Security constraints (non-negotiable, drive design decisions)

- No third-party API key is ever bundled into the mobile client — that's what the Worker is for.
- Local network/WLAN checks read connectivity/security metadata only — never shares, files, print jobs, database contents, or medical record contents.
- Email addresses are only sent to leak-check providers (HIBP) after explicit user consent for that run.
- Reports and checks carry scoring/format version fields for auditability — don't drop these when touching report generation.

# PraxisShield AI Architecture

## Product Surface

PraxisShield AI is split into five mobile areas:

- Dashboard: practice-facing posture, next actions and an explicitly separated technical evidence view
- Check: questionnaire, WLAN scan, external domain check
- Inventory: locally encrypted practice assets and provenance
- Reports: AI-generated audit reports and PDF-ready structure
- Monitoring: current and historical events for SSL, DMARC, leaks and exposed ports

The app supports two commercial audiences from the same codebase: direct medical practices and white-label IT partners. Partner ownership is represented by `white_label_partner_id` in `practices` and can be expanded into a partner table when tenant management is implemented.

## Runtime Boundaries

Mobile app:

- Owns user interaction, in-memory feature state, haptics, push registration and local scan orchestration.
- Persists Supabase authentication through Expo SecureStore; MMKV is limited to non-sensitive optimistic caches.
- Calls Supabase for authenticated practice data and realtime monitoring.
- Calls the Hono Worker for external security APIs and AI report generation.

Supabase:

- Owns authentication, relational practice data, reports, checks, monitoring events and WLAN scans.
- RLS policies keep practice data scoped to authorized practice owners and partner roles.
- Does not host application Edge Functions; report generation and external checks run through the Hono Worker.

Cloudflare Worker:

- Acts as API facade for third-party security providers.
- Keeps provider keys out of the mobile app.
- Normalizes results into PraxisShield findings before scoring.

## API Versioning Convention (DB-12)

All current Worker endpoints live under `/api/*` with no version segment. New or
behavior-changed endpoints going forward should be introduced under `/api/v1/*` instead, so a
future breaking change gets a clean `/api/v2/*` migration window rather than forcing a
coordinated app+Worker deploy. Existing `/api/*` paths are not being renamed by this
convention alone — only new/changed surface area adopts `/api/v1/*`.

## Data Flow

1. A practice signs in and creates/loads a `practice`.
2. The questionnaire updates local Zustand state and recalculates a provisional score.
3. WLAN scanning uses Expo Network today, with `react-native-wifi-reborn` and a custom native module as the next deeper device-discovery layer.
4. External domain checks use `/api/check/external` on the Hono Worker. The app integration remains disabled behind `AppConfig.features.externalCheckEnabled` until provider timeouts are implemented.
5. Findings are stored in `security_checks`; reports link to the check through `reports.check_id`.
6. Monitoring writes events into `monitoring_events`; Supabase Realtime can stream them into the Monitoring tab.

## Data Loading: Dashboard vs. Monitoring tab (PERF-06)

The Dashboard tab and the Monitoring tab intentionally use two different initial-load paths:

- **Dashboard tab** reads through the Worker's aggregated `/dashboard` endpoint (service-role
  aggregation of six result sets in one handler). It has no realtime requirement, so a single
  server-aggregated snapshot per load is the right shape.
- **Monitoring tab** loads its initial data through the client-side, RLS-scoped Supabase client
  (`lib/monitoring/service.ts` → `loadMonitoringDashboard`) instead of the Worker. This is
  deliberate: the Monitoring tab layers a live Supabase Realtime subscription
  (`subscribeToMonitoringRealtime`) over the same `monitoring_snapshots`/`monitoring_events`
  tables. Loading the initial page over the same RLS-authorized client that owns the Realtime
  channel keeps one consistent authorization model and one data shape (`DashboardData`) for both
  the initial page and the streamed deltas. Routing the first load through the Worker would create
  a second, divergent auth path (service role) for data that the Realtime layer then mutates
  in place.

This duplication of load paths was reviewed (PERF-06) and kept — documented here rather than
consolidated — because collapsing onto the Worker endpoint would either lose the single-auth-model
property or require re-implementing the Realtime overlay on top of a server-aggregated payload. If
a shared cache/consolidation is pursued later, the Realtime overlay must remain the source of truth
for post-load mutations.

## Dashboard truth and presentation contract (SP2-03)

The dashboard intentionally has two audience levels:

- **Für die Praxis** is the default. It presents the authoritative traffic-light decision, a bounded
  plain-language statement, exactly three prioritized actions and an explicit evidence-coverage
  limitation. It does not present a questionnaire score as an overall practice score.
- **Technikdetails** contains the questionnaire partial score, evidence coverage, evidence confidence,
  aggregate evidence freshness, rule-level evidence and a questionnaire-only trend. WLAN, external
  and monitoring values remain separately labelled partial values and cannot replace that trend.

The persisted `scoreReport.ampel` is authoritative for the status. UI code must not derive a more
positive posture from the numeric score. A legacy green status is downgraded in presentation when
evidence confidence/coverage is below the scoring gate, review is required, or evidence is stale.
`deriveScoreReportPosture` is the single shared derivation for both dashboard posture and practice
guidance; consumers must not duplicate its threshold or freshness rules.
Unknown freshness is shown as unknown and never silently relabelled as current. The dashboard Worker
also projects persisted WLAN and monitoring coverage, including platform capabilities marked
`unsupported`; unsupported sensors remain visible but are not counted as failed supported sensors.

Customer-facing labels avoid unbounded claims such as “sicher”, “echte Prüfdaten” or “live”. The
monitoring tab is therefore labelled “Ereignisse”. Commercial tariff/upgrade prompts do not appear
inside the security posture or evidence hierarchy.

## Canonical report artifacts (SP2-04)

Persisted reports are created only from a tenant-bound stored security check. The Worker derives one
canonical assessment snapshot containing the questionnaire and canonical scoring facts, encrypts it
with AES-256-GCM, and hashes its canonical (recursively key-sorted) JSON representation. A public-safe
manifest binds that snapshot hash to the source check, facts/scoring/report versions, generated report
payload hash and PDF template version. `persist_assessment_report` writes manifest and report in one
database transaction and returns an existing pair for an idempotent client retry.

Canonical JSON accepts only the JSON value domain and finite JavaScript numbers, normalizes negative
zero, rejects unsupported/cyclic values, and delegates decimal/exponent rendering to
`JSON.stringify`. Domain values that cannot be represented exactly as JavaScript numbers use strings.

`POST /api/report/pdf` accepts only `practiceId` and a persisted `reportId`. It reloads the
tenant-scoped encrypted report, verifies the manifest and report hashes, and renders every PDF page
from the stored artifact with the manifest's original timestamp. Repeated exports are byte-identical;
the response exposes PDF and manifest integrity metadata. Android/iOS never render an alternative
report: they write the returned server bytes only to a tenant-scoped `expo-file-system` cache
directory, not the backup-included documents directory, and open that artifact through the native
`expo-sharing` dialog. A `finally` removes the plaintext PDF as soon as the dialog closes or fails;
logout, practice switching and local practice removal also delete the cache idempotently. Legacy
reports without a manifest remain readable but fail closed for canonical PDF export; decrypt failures
are reported as integrity conflicts. The report index reloads persisted history after restart, and
each detail view can export its own canonical artifact.

## Security Model

### Purpose-bound consent registry (SP2-05)

External providers are authorized only by the server-side, append-only `consent_log`; request booleans
express scan intent and never grant permission. Registry events bind practice, actor, purpose, exact
text version, structured provider/data scope, acceptance time, expiry and withdrawal. PostgreSQL
links every new event to its predecessor while an advisory transaction lock serializes concurrent
events for the same practice and purpose. Active-state RPCs accept the Worker `service_role` only,
use a fixed empty `search_path`, and return true only for the latest accepted, unwithdrawn,
unexpired event on the current text version.

The authenticated Worker owns all writes and derives version, scope and one-year validity from the
shared consent contract. Managers may grant or withdraw; viewers may read the current status. Both
the manual provider path and the monitoring path check the registry before quota consumption or any
outbound request. HIBP has a separate purpose because it receives an email address. Scheduled runs
first obtain the active-practice sets from the database and skip practices or email checks without
the respective consent. Registry lookup failure is fail-closed. Consent evidence is included in the
privacy export; its legal retention/deletion treatment remains subject to the documented privacy
policy and legal review.

- No third-party API key is bundled into the app.
- Supabase anon key is public but protected by RLS.
- Service role keys stay in server environments only.
- Practice data is scoped by `owner_id` initially and can later support partner-scoped tenant policies.
- Report payloads are structured JSON so PDF export and partner branding can be generated deterministically.

## Next Native Milestones

- Add a custom Expo config plugin for the WLAN native module.
- Implement push token registration and alert notification channels.
- Add versioned partner logo/theme inputs to the server-owned PDF template without introducing a client renderer.
- Add Supabase generated TypeScript types after the local schema is running.
- Persist external check results and monitoring deltas after SecurityTrails, Shodan, HIBP, VirusTotal, SSL Labs and Cloudflare DNS return normalized Worker output.
- External checks expose per-provider status (`active`, `not_configured`, `unavailable`) so missing API keys are reported as not checked instead of being interpreted as no risk.
- Domain checks include bounded subdomain discovery through SecurityTrails, with a Cloudflare DNS common-host fallback, and evaluate each discovered subdomain separately for DNS/TLS posture.
- Mail security checks cover SPF, DKIM and DMARC alignment readiness plus MTA-STS, TLS-RPT and CAA DNS records.
- The Monitoring tab lets practices maintain explicit external targets for domains, subdomains and email addresses. Provider and HIBP permissions are persisted, purpose-bound, expiring and immediately revocable through the consent registry.
- Monitoring snapshots persist a small comparison summary for open critical ports, DNS fingerprints, DMARC policy and certificate fingerprints. This enables historical states for findings: new, recurring, resolved or unchanged, while full check payloads remain encrypted.

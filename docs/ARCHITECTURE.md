# PraxisShield AI Architecture

## Product Surface

PraxisShield AI is split into four mobile areas:

- Dashboard: current Shield Score, urgent findings, score history
- Check: questionnaire, WLAN scan, external domain check
- Reports: AI-generated audit reports and PDF-ready structure
- Monitoring: realtime events for SSL, DMARC, leaks and exposed ports

The app supports two commercial audiences from the same codebase: direct medical practices and white-label IT partners. Partner ownership is represented by `white_label_partner_id` in `practices` and can be expanded into a partner table when tenant management is implemented.

## Runtime Boundaries

Mobile app:

- Owns user interaction, offline state, haptics, push registration and local scan orchestration.
- Uses MMKV for persisted session/check state.
- Calls Supabase for authenticated practice data and realtime monitoring.
- Calls the Hono Worker for external security APIs and AI report generation.

Supabase:

- Owns authentication, relational practice data, reports, checks, monitoring events and WLAN scans.
- RLS policies keep practice data scoped to the authenticated owner.
- Edge Functions can run close to the database for report generation and persisted scans.

Cloudflare Worker:

- Acts as API facade for third-party security providers.
- Keeps provider keys out of the mobile app.
- Normalizes results into PraxisShield findings before scoring.

## Data Flow

1. A practice signs in and creates/loads a `practice`.
2. The questionnaire updates local Zustand state and recalculates a provisional score.
3. WLAN scanning uses Expo Network today, with `react-native-wifi-reborn` and a custom native module as the next deeper device-discovery layer.
4. External domain checks run through `/api/external-check` on the Hono Worker (`/security/external` remains as a compatibility alias).
5. Findings are stored in `security_checks`; reports link to the check through `reports.check_id`.
6. Monitoring writes events into `monitoring_events`; Supabase Realtime can stream them into the Monitoring tab.

## Security Model

- No third-party API key is bundled into the app.
- Supabase anon key is public but protected by RLS.
- Service role keys stay in server environments only.
- Practice data is scoped by `owner_id` initially and can later support partner-scoped tenant policies.
- Report payloads are structured JSON so PDF export and partner branding can be generated deterministically.

## Next Native Milestones

- Add a custom Expo config plugin for the WLAN native module.
- Implement push token registration and alert notification channels.
- Add PDF rendering with partner logo/theme inputs.
- Add Supabase generated TypeScript types after the local schema is running.
- Persist external check results and monitoring deltas after SecurityTrails, Shodan, HIBP, VirusTotal, SSL Labs and Cloudflare DNS return normalized Worker output.
- External checks expose per-provider status (`active`, `not_configured`, `unavailable`) so missing API keys are reported as not checked instead of being interpreted as no risk.
- Domain checks include bounded subdomain discovery through SecurityTrails, with a Cloudflare DNS common-host fallback, and evaluate each discovered subdomain separately for DNS/TLS posture.
- Mail security checks cover SPF, DKIM and DMARC alignment readiness plus MTA-STS, TLS-RPT and CAA DNS records.

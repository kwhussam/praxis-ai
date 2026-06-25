# PraxisShield AI

Native Mobile-App fuer Cybersecurity und DSGVO-Compliance in deutschen Arztpraxen.

Kernversprechen: Kein IT-Wissen noetig. Keine Installation auf Praxis-PCs. Volle Sicherheitstransparenz in 5 Minuten.

## Stack

- Mobile: React Native + Expo SDK 51, Expo Router
- UI: NativeWind, React Native Reanimated 3, Moti, Expo Blur, custom glass surfaces
- State/Data: Zustand, TanStack Query, MMKV
- Charts: Victory Native XL plus custom SVG score/radar visuals
- Backend: Supabase Auth, Postgres, Realtime, Edge Functions
- Edge API: Hono.js on Cloudflare Workers
- AI: Anthropic Claude API via Edge Function or Worker
- Security Integrations: SecurityTrails, Shodan, HaveIBeenPwned, MXToolbox

## Start

```bash
npm install
npm run start
```

Worker lokal starten:

```bash
npm run workers:dev
```

Supabase-Migrationen:

```bash
supabase db reset
```

## Struktur

```text
app/                  Expo Router screens
components/ui/        PraxisShield design system
components/charts/    Score, history and risk visualizations
components/modules/   Feature modules
lib/api/              Supabase and edge API clients
lib/security/         Scoring, WLAN and external checks
lib/ai/               AI report contracts
lib/store/            Zustand stores
supabase/             DB schema and edge functions
workers/hono/         Cloudflare Worker API facade
```

## Design Notes

PraxisShield startet mit Dark Mode als primaerem Theme. Die Kernoberflaeche nutzt Deep Navy, Electric Blue und klare Signal-Farben fuer Risiken. Interaktionen sind absichtlich app-like: animierte Cards, haptische Buttons, Pulse-Indikatoren fuer Live-Alerts und eigene Score-Visualisierungen statt Standard-Dashboard-Komponenten.

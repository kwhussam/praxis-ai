# Local Maestro E2E setup

This setup is local-only. It starts a real Supabase stack, replays every migration,
loads the shared RLS/E2E seed, and starts the Hono Worker against that stack. No
Maestro flows are included yet.

## Why a development build

Use a native Expo development build, not Expo Go. PraxisShield includes custom Expo
plugins, native network probes, and `react-native-wifi-reborn`; Expo Go does not
contain those native modules. Maestro must drive the same bundle identifier and
native runtime that the application actually uses.

The test app identifiers are:

- iOS bundle ID: `ai.praxisshield.app`
- Android package: `ai.praxisshield.app`

## Prerequisites

1. Install and start Docker Desktop.
2. Install Supabase CLI 2.109.1 or newer.
3. Install Java 17 or newer and configure `JAVA_HOME`.
4. Install Maestro:

   ```bash
   curl -fsSL "https://get.maestro.mobile.dev" | bash
   export PATH="$PATH:$HOME/.maestro/bin"
   maestro --version
   ```

   The repository launcher `scripts/e2e/maestro.sh` automatically discovers the
   Homebrew Java 17 installation and `~/.maestro/bin/maestro`. Verify it with
   `npm run e2e:maestro:check`.

5. Install project dependencies:

   ```bash
   npm install
   ```

The Maestro workspace is configured in `.maestro/config.yaml`. Future flows belong
in `.maestro/flows/`; reusable setup fragments belong in `.maestro/subflows/`.
Generated Maestro screenshots and logs go to `.maestro/artifacts/` and are ignored.

## Run the smoke suite

Install the development build once with `npm run e2e:app:ios` or
`npm run e2e:app:android`. Afterwards, the local iOS suite is:

```bash
npm run e2e:smoke
```

Use `npm run e2e:smoke:android` for Android. The smoke runner starts with
`e2e:env:up`, so every complete suite run receives a fresh database, all
migrations, and the shared seed. It then starts Metro when necessary and runs
all flows sequentially while continuing after individual failures.

Flows `09-privacy-viewer-forbidden` and `10-privacy-owner-allowed` are API
integration tests hosted in the Maestro suite. They validate a real Supabase
JWT against the real Worker and database role checks; they do not exercise a
privacy UI. The owner test creates a unique disposable user and practice and
never deletes seeded Practice B.

## Start the backend

```bash
npm run e2e:env:up
```

This command:

1. Starts local Supabase.
2. Runs `supabase db reset`, applying every migration in timestamp order.
3. Loads `supabase/seed.sql`.
4. Verifies that all four accounts can sign in and that both practices and role
   grants exist.
5. Starts the local Hono Worker on port 8787.

Generated local keys and RLS variables are written to `.e2e/runtime.env`. This file
is ignored and can be loaded for manual commands:

```bash
source .e2e/runtime.env
npm run test:rls
```

Use `npm run e2e:env:down` to stop the Worker and Supabase containers.

## Build and start the app

iOS Simulator:

```bash
npm run e2e:app:ios
```

Android Emulator:

```bash
npm run e2e:app:android
```

These commands build/install the native development app and start Metro with:

- `EXPO_PUBLIC_APP_ENV=test`
- `EXPO_PUBLIC_EXTERNAL_CHECK_ENABLED=false`
- `EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321` on iOS
- `EXPO_PUBLIC_SUPABASE_URL=http://10.0.2.2:54321` on Android
- `EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8787` on iOS
- `EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:8787` on Android

After the native app is installed, Metro can be restarted without rebuilding via
`npm run e2e:metro:ios` or `npm run e2e:metro:android`.

## Seed accounts

All accounts use the local-only password `Local-E2E-2026!`.

| Role | Email | Practice |
|---|---|---|
| Owner | `owner-a@example.test` | E2E Praxis A |
| Manager | `manager@example.test` | E2E Praxis A |
| Viewer | `partner@example.test` | E2E Praxis A |
| Cross-tenant owner | `owner-b@example.test` | E2E Praxis B |

Practice IDs remain deterministic:

- Practice A: `20000000-0000-4000-8000-0000000000a1`
- Practice B: `20000000-0000-4000-8000-0000000000b1`

The Jest RLS test consumes these same seed credentials through the generated
`.e2e/runtime.env`; there is no separate E2E database seed.

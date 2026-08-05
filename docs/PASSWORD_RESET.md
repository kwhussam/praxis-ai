# Password reset (W4c)

The separate admin-initiated branch (W4e/B5) is specified in
`docs/W4E_ADMIN_PASSWORD_RESET_CONTRACT.md`. It deliberately does not change
this self-service W4c flow until the shared email-OTP TTL has passed staging
regression tests.

End-to-end "forgot password" flow for the mobile app. A user requests a reset
link, opens it on the device, lands in the app through a deep link, and sets a
new password against a short-lived recovery session.

## Flow

1. **Request** — On the login screen the user taps "Passwort vergessen".
   `requestPasswordReset(email)` (`lib/auth/password-reset.ts`) normalizes the
   address and calls `supabase.auth.resetPasswordForEmail(email, { redirectTo })`
   with `redirectTo = PASSWORD_RESET_REDIRECT_URL` (`praxisshield://reset-password`).
   The UI shows an enumeration-safe notice ("Falls ein Konto … existiert …") so it
   never reveals whether the address has an account.
2. **Email link** — Supabase sends the recovery email. The link opens the app via
   the `praxisshield` scheme (declared in `app.json`) and resolves to the
   `app/(auth)/reset-password.tsx` route. The `(auth)` group is hidden in the path,
   so the reachable path is `reset-password`.
3. **Restore session** — The screen reads the full incoming URL with
   `expo-linking`'s `useURL()` (the client sets `detectSessionInUrl: false`, so the
   URL is parsed manually). `establishRecoverySession(url)`:
   - `parseRecoveryUrl` extracts, dependency-free, either implicit-flow fragment
     tokens (`#access_token=…&refresh_token=…`), the PKCE `?code=…`, or Supabase's
     error redirect (`?error_code=…&error_description=…`).
   - Implicit → `supabase.auth.setSession({ access_token, refresh_token })`.
   - PKCE → `supabase.auth.exchangeCodeForSession(code)`.
   - Returns `{ ok: true }`, or `{ ok: false, reason }` with
     `invalid_link | expired | session_failed`.
4. **Set new password** — With a valid recovery session the screen shows two fields
   (new password + confirm), validates length ≥ 8 and match, then calls
   `updateUserPassword(newPassword)` → `supabase.auth.updateUser({ password })`.
5. **Finish** — On success the screen signs all refresh sessions out
   (`supabase.auth.signOut({ scope: "global" })`) and asks the user to sign in
   with the new password. If that best-effort revocation fails after the password
   has already changed, the screen preserves the successful outcome and warns
   about potentially active sessions on other devices.

## States shown to the user

| State | Trigger | Copy intent |
| --- | --- | --- |
| Verifying | URL not yet parsed | Spinner "Link wird geprüft…" |
| Invalid link | no recovery params | "Link ist ungültig … neuen Link anfordern" |
| Expired | `error_code`/description contains `expired`/`otp_expired` | "Link ist abgelaufen …" |
| Session failed | `setSession`/`exchange` error | "Sitzung konnte nicht wiederhergestellt werden …" |
| Ready | recovery session established | password + confirm form |
| Form error | `updateUser` rejects (e.g. weak/identical password) | Supabase message surfaced |
| Success | password updated | "Passwort geändert … jetzt anmelden" |

## Required backend configuration (not in code)

For the redirect to work end-to-end, the redirect URL must be allow-listed in the
Supabase project's **Authentication → URL Configuration → Redirect URLs**:

```
praxisshield://reset-password
```

Without this entry Supabase rejects the `redirectTo` and the link falls back to the
project Site URL, so the app is never opened. This is an environment/config step per
Supabase project (local, staging, production) and is intentionally kept out of the
client bundle.

## Security notes

- The sending side does not disclose account existence.
- Recovery tokens and the new password are never logged.
- Error states render fixed German copy, not reflected `error_description` content.
- The recovery session is cleared after a successful change (sign out + re-login).
- Both implicit and PKCE flows are handled, so the flow keeps working if the client
  `flowType` changes.

## Tests

`lib/auth/__tests__/password-reset.test.ts` covers URL parsing (fragment, PKCE,
error, empty), session restoration (implicit, PKCE, expired, invalid, failure), the
`redirectTo` argument, and the password update path. The screen itself has no
component test — the repository has no React Native Testing Library infrastructure;
the deep-link entry is exercised manually on a native dev build.

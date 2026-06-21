# rickai mobile

Expo (SDK 56, expo-router) client for the rickai backend. This is **plumbing**:
auth + the 3-tab shell + a verified connection to the `turn` edge function. UI/UX
comes later.

Kept JS-only (no custom native modules) so it runs in **Expo Go** — scan the QR
with the latest Expo Go app (Expo Go is single-SDK; the App Store build runs
SDK 56). We'll graduate to a development build
(`npx expo run:ios`) when we add a native dependency, e.g. native Google/Apple
sign-in.

## What's wired

- **Auth** — passwordless email OTP via Supabase (`signInWithOtp` → `verifyOtp`).
  Session persists in AsyncStorage and auto-refreshes while foregrounded
  (`src/lib/supabase.ts`, `src/lib/auth.tsx`).
- **Auth gate** — `src/app/_layout.tsx` redirects between the `(auth)` and
  `(tabs)` route groups based on the session.
- **3 tabs** (`src/app/(tabs)/`) — **Chat** (also the end-to-end pipe test),
  **Topics** (stub), **Profile** (session info + sign out).
- **API** — `src/lib/api.ts` calls `POST /functions/v1/turn` with the session JWT
  as a Bearer token. The server derives `student_id` from that token; the body
  never sends an identity.

## Run it

1. Start the backend from the repo root:
   ```bash
   supabase start
   supabase functions serve --no-verify-jwt --env-file ./supabase/.env
   ```
2. Configure env:
   ```bash
   cp .env.example .env   # already points at local Supabase
   ```
   - **iOS simulator** can reach `127.0.0.1` as-is.
   - **Physical device**: set `EXPO_PUBLIC_SUPABASE_URL` to your machine's LAN IP
     (e.g. `http://192.168.1.20:55321`) so the phone can reach the stack. Restart
     the dev server after editing `.env`.
3. Start Expo and open in Expo Go:
   ```bash
   npm start          # scan the QR with the Expo Go app
   # or press i / a / w for simulator / emulator / web
   ```

## Signing in (local)

Local Supabase doesn't send real email — the OTP code lands in **Mailpit**:
http://127.0.0.1:55324. Enter an email in the app, grab the 6-digit code from
Mailpit, and verify.

## Providers (later)

Google/Apple work via the OAuth web flow without leaving Expo Go, but need
provider credentials (Google Cloud client; Apple needs a paid developer account)
plus a deep-link scheme. The auth layer is a thin wrapper around `supabase.auth`,
so adding `signInWithOAuth` is additive — no refactor.

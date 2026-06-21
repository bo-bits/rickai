# rikai

A personal tutor whose value is the **context layer**, not the content. Claude
already knows everything; rikai knows *this student* — what they've explored,
what lights them up, what doesn't stick — and teaches accordingly.

See [docs/design-brief.md](docs/design-brief.md) for the full design rationale.

## Architecture

```
mobile/      Expo (SDK 56) React Native app — the chat client
supabase/    Postgres schema (migrations) + Edge Functions (the orchestrator)
  functions/
    turn         one stateless tutoring turn (read/teach path, owns the inner tool loop)
    consolidate  write path — distills a finished session into profile + topic memory
    compact      context-pressure path — summarizes a long session and reopens a fresh one
    _shared/     clients, auth, http, telemetry helpers
docs/        design brief
rikai-tutor/ curriculum + prompt source material (not runtime)
```

- **LLM:** raw Anthropic Messages API (no Agent SDK). Default model
  `claude-sonnet-4-6`, override with `ANTHROPIC_MODEL`.
- **Orchestrator:** Supabase Edge Functions (Deno). Each turn is a stateless
  event; the client drives the outer conversation loop, one call per message.
- **DB:** Supabase Postgres. Tables: `documents`, `topics`, `sessions`,
  `llm_calls` (telemetry).
- **Auth:** Supabase email OTP. The verified JWT's user id *is* the
  `student_id`; the body never carries identity.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) (for the local Supabase stack)
- [Supabase CLI](https://supabase.com/docs/guides/cli) (`brew install supabase/tap/supabase`)
- Node.js 20+
- An [Anthropic API key](https://console.anthropic.com/settings/keys)

## Running locally

### 1. Backend — Supabase

From the repo root:

```bash
# Provide the Anthropic key to the local Edge runtime. Gitignored.
echo 'ANTHROPIC_API_KEY=sk-ant-...' > supabase/functions/.env

# Start Postgres + Auth + Edge Functions. Runs migrations on first start.
supabase start
```

`supabase start` prints the local URLs and keys. The defaults (from
`supabase/config.toml`):

| Service        | URL                       |
|----------------|---------------------------|
| API / Functions| http://127.0.0.1:55321    |
| Studio         | http://127.0.0.1:55323    |
| Mailpit (mail) | http://127.0.0.1:55324    |
| Postgres       | `127.0.0.1:55322`         |

> The Edge runtime loads `supabase/functions/.env` at start. If you add or
> change the key, restart with `supabase stop && supabase start`.

To reset the DB (re-run migrations from scratch):

```bash
supabase db reset
```

> **V0 is read/teach-only.** Rows are read at runtime; the `turn` function does
> not yet seed profile/topic content for a new user. To see contextual teaching,
> hand-seed a `documents` profile row and a few `topics` rows for your user via
> Studio (http://127.0.0.1:55323). The `consolidate` function writes this memory
> back once a session resolves.

### 2. Frontend — mobile app

```bash
cd mobile
cp .env.example .env   # already points at the local stack
npm install
npm start
```

Then open the app in the iOS simulator (`i`), Android emulator (`a`), or Expo
Go on a device.

> **Physical device:** `127.0.0.1` resolves to the phone, not your machine. Set
> `EXPO_PUBLIC_SUPABASE_URL` in `mobile/.env` to your machine's LAN IP (e.g.
> `http://192.168.1.20:55321`) and restart the dev server.

### 3. Sign in

The app uses **email OTP**. Enter any email on the sign-in screen, then read the
6-digit code from **Mailpit** at http://127.0.0.1:55324 (local mail is captured,
not sent). Enter it to complete sign-in — that mints the JWT the Edge Functions
verify.

## Calling the functions directly

`turn` requires the caller's JWT (identity comes from the token). `consolidate`
and `compact` take a `session_id` in the body and are invoked manually (curl) —
no automation in this iteration.

```bash
# A turn (needs a real user access token):
curl -X POST http://127.0.0.1:55321/functions/v1/turn \
  -H "Content-Type: application/json" \
  -H "apikey: <ANON_KEY>" \
  -H "Authorization: Bearer <USER_ACCESS_TOKEN>" \
  -d '{"user_message":"Tell me about the Peloponnesian War","topic_slug":null}'

# Write a finished session back to durable memory:
curl -X POST http://127.0.0.1:55321/functions/v1/consolidate \
  -H "Content-Type: application/json" \
  -H "apikey: <ANON_KEY>" \
  -d '{"session_id":"<uuid>"}'
```

## Deploying

```bash
supabase link --project-ref <your-project-ref>
supabase db push                              # apply migrations
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase functions deploy turn consolidate compact
```

Point the mobile build at the hosted project by setting
`EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` to your project's
values.

## Troubleshooting

- **"Could not resolve authentication method" / model call fails** — the Edge
  runtime has no Anthropic key. Locally: create `supabase/functions/.env` and
  restart. Deployed: `supabase secrets set ANTHROPIC_API_KEY=...`.
- **"invalid or expired token"** — the app's session JWT is stale (often after a
  `supabase db reset` or a long idle). Sign out and sign back in to mint a fresh
  one.
- **Device can't reach the backend** — use your LAN IP, not `127.0.0.1`, in
  `mobile/.env`.

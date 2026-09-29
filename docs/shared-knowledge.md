# Shared team learning (KB API backend)

AIntegration stores feedback and learned knowledge through a **Supabase Edge Function**
(`kb-api`). The GitHub Pages SPA only needs a public URL — no anon key or team write
secret is shipped in the browser bundle.

## 1. Database (once)

If you have not already, run [`supabase/schema.sql`](../supabase/schema.sql) in the
Supabase SQL Editor. Keep `YOUR_TEAM_WRITE_SECRET` in that SQL identical to the
`TEAM_WRITE_SECRET` Edge Function secret below.

## 2. Edge Function secrets

In Supabase Dashboard → **Edge Functions** → **Secrets** (or CLI
`supabase secrets set`), set:

| Secret | Purpose |
|--------|---------|
| `SUPABASE_URL` | Project URL (`https://xxxx.supabase.co`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (server only) |
| `TEAM_WRITE_SECRET` | Same value as in `schema.sql` `team_secret_ok` |
| `APP_USERNAME` | Team login username |
| `APP_PASSWORD` | Team login password |
| `SESSION_SIGNING_KEY` | Long random string used to sign session tokens |

## 3. Deploy the function

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy kb-api --no-verify-jwt
```

Function URL:

`https://YOUR_PROJECT_REF.supabase.co/functions/v1/kb-api`

## 4. Frontend env + Pages deploy

Create `.env.local` (gitignored):

```env
VITE_KB_API_URL=https://YOUR_PROJECT_REF.supabase.co/functions/v1/kb-api
```

Remove any old `VITE_SUPABASE_*` / `VITE_TEAM_WRITE_SECRET` entries.

Then:

```bash
npm run deploy
```

## How the loop works

- Login → `kb-api` `login` → short-lived session token in `localStorage`
- Thumbs / corrections / Knowledge desk → `kb-api` with `Authorization: Bearer <token>`
- Approve / reject use `manage_knowledge` RPC with **server-side** `TEAM_WRITE_SECRET`
- Gemini / Pollinations keys stay in the browser only and are never sent to Supabase

## Security notes

- `VITE_KB_API_URL` is public (expected).
- Service role, team write secret, and app password stay in Edge Function secrets.
- A stolen session token can call the API until it expires (~12h).

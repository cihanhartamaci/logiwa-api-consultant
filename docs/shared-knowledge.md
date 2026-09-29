# Shared team learning knowledge base

AIntegration can learn from support feedback (thumbs + corrections) and from approved
`proposeLearnedKnowledge` cards. Without Supabase env vars, learning stays in the
browser `localStorage` only.

## Enable shared team mode

1. Create a free [Supabase](https://supabase.com) project.
2. Open **SQL Editor**, paste [`supabase/schema.sql`](../supabase/schema.sql).
3. Replace `YOUR_TEAM_WRITE_SECRET` in that SQL with a long random string (same value
   you will put in `VITE_TEAM_WRITE_SECRET`).
4. Copy project **URL** and **anon public** key from Project Settings → API.
5. Create `.env.local` from [`.env.example`](../.env.example):

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_TEAM_WRITE_SECRET=same-secret-as-in-schema-sql
```

6. Restart `npm run dev` / rebuild before deploy so Vite bakes the vars into the SPA.

### GitHub Pages deploy

Set the three `VITE_*` values in the environment that runs `npm run deploy` (or GitHub
Actions secrets mapped into the build). Keys are public in the built JS — this matches
the existing shared-password team-trust model. Rotate the team write secret in SQL +
env if it leaks.

## How the loop works

- **Thumbs up** → `answer_feedback` row (`up`).
- **Thumbs down** → correction modal → `answer_feedback` + pending `knowledge_entries`.
- **Approve** (chat card or Knowledge desk) → status `approved` → injected into the
  system prompt (newest 40) and BM25 retrieval (`[LK-…]` citations).
- **Knowledge desk** (sidebar) → review pending / approved / rejected, edit, export JSON.

Gemini and Pollinations API keys are never sent to Supabase.

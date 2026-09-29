# AIntegration (Logiwa API consultant)

Static React + Vite app for Logiwa Open API / Help Center Q&A.

Live: https://cihanhartamaci.github.io/logiwa-api-consultant

## Scripts

- `npm run dev` — local Vite
- `npm test` — Vitest
- `npm run build` / `npm run deploy` — GitHub Pages

## Shared team learning

Feedback and learned knowledge go through a Supabase Edge Function (`kb-api`).
The SPA only needs `VITE_KB_API_URL` — secrets stay on the server.

See [docs/shared-knowledge.md](docs/shared-knowledge.md) and [`.env.example`](.env.example).

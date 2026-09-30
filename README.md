# AIntegration (Logiwa API consultant)

Static React + Vite app for Logiwa Open API / Help Center Q&A.

Live: https://cihanhartamaci.github.io/logiwa-api-consultant

## Scripts

- `npm run dev` — local Vite
- `npm test` — Vitest
- `npm run build` / `npm run deploy` — GitHub Pages

## Shared team learning

Team feedback/knowledge uses a **Cloudflare Worker + KV** backend. Secrets stay on Cloudflare; the SPA only needs `VITE_KB_API_URL`.

See [docs/shared-knowledge.md](docs/shared-knowledge.md).

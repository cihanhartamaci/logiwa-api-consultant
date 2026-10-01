# Shared team learning (Cloudflare Worker + KV)

GitHub Pages hosts the SPA. Cloudflare Worker holds secrets and stores shared knowledge in KV.
**Passwords / signing keys never go into the SPA bundle or git.**

## Roles

| User | Role | Can do |
|------|------|--------|
| `integrationsteam` | admin | Approve / reject / edit / delete knowledge; Knowledge desk; export JSON; own corrections auto-approved |
| `supportteam` | support | Thumbs up/down + corrections (pending only); no Knowledge desk |

Approval is enforced on the Worker (`403` if support tries approve/reject/update/delete). The UI hides those controls for support.

## Security model

| Location | Contents |
|----------|----------|
| Cloudflare Worker **Secrets** | `APP_USERNAME`, `APP_PASSWORD` (admin), `SUPPORT_USERNAME`, `SUPPORT_PASSWORD`, `SESSION_SIGNING_KEY` |
| Cloudflare **KV** | knowledge + feedback JSON |
| GitHub Pages JS | only public `VITE_KB_API_URL` |
| GitHub repo | Worker source code (no secrets) |

Aliases also accepted: `ADMIN_USERNAME` / `ADMIN_PASSWORD` instead of `APP_*`. Defaults: admin user `integrationsteam`, support user `supportteam`.

## Deploy / update Worker code (dashboard)

1. Open Worker `aintegration-kb-api` → **Edit code**.
2. Replace all code with [`workers/kb-api/src/index.js`](../workers/kb-api/src/index.js).
3. **Deploy**.
4. Confirm bindings: KV variable name **`KB`**, secrets set as below.

Or via CLI (after filling KV id in `wrangler.toml`):

```bash
cd workers/kb-api
npx wrangler deploy
npx wrangler secret put APP_USERNAME
npx wrangler secret put APP_PASSWORD
npx wrangler secret put SUPPORT_USERNAME
npx wrangler secret put SUPPORT_PASSWORD
npx wrangler secret put SESSION_SIGNING_KEY
```

Suggested values:

- `APP_USERNAME` = `integrationsteam`
- `SUPPORT_USERNAME` = `supportteam`
- `SUPPORT_PASSWORD` = (new password you share only with support)

If `SUPPORT_PASSWORD` is missing, support login is disabled.

## Frontend env

`.env.local` (gitignored):

```env
VITE_KB_API_URL=https://aintegration-kb-api.cihanhartamaci.workers.dev
```

Then `npm run deploy` for GitHub Pages.

## Product loop

1. **supportteam** signs in → rates answers (thumbs) and submits corrections → entries land as **pending**
2. **integrationsteam** corrections are **auto-approved** into the shared knowledge base
3. **integrationsteam** opens Knowledge desk → **Approve** or **Reject** support pending entries
4. Approved entries → prompt + BM25 (`[LK-…]`) for the whole team

## Best-practice documents

- Sidebar → **Add best-practice doc** (both roles). Paste text or upload a file (PDF, Word .docx, Markdown, TXT, CSV, JSON, YAML, XML, HTML). Optional reference link.
- Text is extracted in the browser (`src/services/documentExtract.js`): .docx via a built-in zip reader + `DecompressionStream`, PDF via pdf.js loaded lazily only when a PDF is picked. Scanned PDFs (no selectable text) and legacy binary .doc files show an error asking for pasted text / a .docx.
- Stored as knowledge entries with `source: "document"` (max 200,000 characters each).
- Support uploads are **pending**; integrationsteam uploads are **approved** immediately.
- Approved documents are chunked into the BM25 index and cited as `[LK-…]`. Unlike short corrections, they are **not** pasted into the system prompt, so long guides don't bloat every request.
- Knowledge desk → **Documents** filter to review them.

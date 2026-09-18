# Retina

Template for an AI app on the house standard: a Next.js frontend on Vercel, an
Express API + Postgres on the Monash server behind an ngrok tunnel, and an
llm-proxy on that server fronting the Claude Code subscription and local Qwen.

```
browser ─▶ frontend (Vercel) ─▶ ngrok ─▶ backend (Monash :8091) ─▶ llm-proxy (:4000) ─▶ claude -p / Ollama
teammate ─────────────────────▶ same URL, Bearer TEAM_API_KEY
```

```
frontend/   Next.js. app/page.tsx is a demo chat; lib/api-client.ts is the only door to the backend.
backend/    Express. src/app.ts routes, src/auth.ts two bearer keys, src/llm.ts the proxy client,
            src/db.ts the pool, db/migrate.mjs applies db/migrations/*.sql before the API listens.
deploy/     Everything the Monash box runs: compose, llm-proxy config + unit, ngrok, auto-deploy, runbook.
```

`frontend/` and `backend/` are independent pnpm packages. Run pnpm commands
inside one of them, never at the root. The API contract types live in both
`frontend/lib/api-client.ts` and `backend/src/llm.ts`; keep them in step.

## Local

```bash
cd backend && cp .env.example .env
docker compose -f compose.local.yaml up -d      # Postgres on 5433
pnpm install && pnpm db:migrate && pnpm dev      # API on :8091

cd frontend && cp .env.example .env.local        # same API_SHARED_SECRET as the backend
pnpm install && pnpm dev                          # web on :3000
```

The backend needs an llm-proxy on `127.0.0.1:4000` — on the dev machine,
`~/ai/tools/llm-proxy` (`./scripts/start.sh`). The `test` alias echoes without
any provider; without a proxy at all, `/ai/chat` returns 503.

## API

Every route except `/health` takes `Authorization: Bearer <key>`, where the key
is `API_SHARED_SECRET` (the frontend) or `TEAM_API_KEY` (the team).

| Route | Returns |
| --- | --- |
| `GET /health` | `{"status":"ok","database":"up"}` |
| `GET /ai/models` | `{ models: [{ id, provider, model }] }` — the aliases to use |
| `POST /ai/chat` | `{ model, messages, system?, maxTokens? }` → `{ text, model, stopReason, usage, costUsd }` |

## Deploying

**Frontend** — a Vercel project on this repo with **Root Directory** `frontend`
and two environment variables: `BACKEND_URL` (the ngrok hostname from the box
setup) and `API_SHARED_SECRET` (same value as the box's `.env`). There is no
sign-in in this template: the page is public, so add a gate before the URL
leaves the team. Every push to `main` deploys; rollback is Deployments →
Promote to Production. The chat action declares `maxDuration = 300`, Vercel's
function ceiling; `lib/api-client.ts` times out just under it.

**Backend** — push to `main`. GitHub Actions type-checks both packages and
publishes `ghcr.io/noobmaster169/retina-api:main`; `auto-deploy.sh` on the
Monash box pulls (or builds) it every 3 minutes, polls `/health`, and rolls
back on failure. Box setup, the tunnel, llm-proxy and the runbook:
[deploy/README.md](./deploy/README.md).

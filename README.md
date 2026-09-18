# Retina

An AI app in three packages, all in this repo:

```
browser ─▶ frontend (Next.js) ─▶ backend (Express + Postgres) ─▶ proxy (llm-proxy) ─▶ claude -p / Ollama
```

| Package | What | Runs on |
| --- | --- | --- |
| `frontend/` | Next.js UI. Talks only to the backend, server-side, with a shared secret. | your laptop; Vercel in prod |
| `backend/` | Express API. Two bearer keys (frontend, team). Proxies `/ai/chat` to the proxy. Postgres for app data. | your laptop; the Monash box in prod |
| `proxy/` | llm-proxy: one Anthropic-wire endpoint in front of the Claude Code subscription (`claude -p`) and local Qwen (Ollama). | your laptop; the Monash box in prod |
| `deploy/` | Everything the Monash box runs: compose, runners, the runbook. | the Monash box |

Each package is independent: its own dependencies, `.env`, and start command.
Run commands **inside a package**, never at the repo root.

## Prerequisites

| Tool | For | Check |
| --- | --- | --- |
| Node 24 + pnpm 11 | frontend, backend | `node -v`, `corepack enable && pnpm -v` |
| Docker | the local Postgres | `docker ps` |
| Python 3.10+ | proxy | `python3 --version` |
| Claude Code, logged in | the `claude*` / `default` aliases | `claude -p "say ok"` prints ok |
| Ollama with a Qwen model (optional) | the `qwen*` aliases | `ollama list` shows `qwen3:14b` |

Without Claude Code you still get the `test` alias, which echoes, and Qwen if
you have Ollama. Without either, the app runs but every chat returns an error
from the proxy, which is the correct behaviour.

## First run

Three terminals, in this order.

**1. Proxy** (port 4000)

```bash
cd proxy
python3 -m venv .venv && .venv/bin/pip install -e ".[dev]"
./start.sh
curl -s 127.0.0.1:4000/healthz
```

`proxy/proxy.yaml` is committed and needs no editing. It has no secrets: the
subscription rail uses your own `claude` login, and Ollama has no key.

**2. Backend** (port 8091)

```bash
cd backend
cp .env.example .env            # defaults work; change the two keys if you like
docker compose -f compose.local.yaml up -d      # Postgres on 5433
pnpm install && pnpm db:migrate && pnpm dev
curl -s 127.0.0.1:8091/health   # {"status":"ok","database":"up"}
```

**3. Frontend** (port 3000)

```bash
cd frontend
cp .env.example .env.local      # API_SHARED_SECRET must equal the backend's
pnpm install && pnpm dev
```

Open http://localhost:3000, pick `test`, send "ping", see "echo: ping". Pick
`claude-fast` for a real answer through your Claude Code subscription.

### Pointing the frontend at the production backend instead

Set `BACKEND_URL=https://purebred-shank-riptide.ngrok-free.dev` in
`frontend/.env.local`, with the production `API_SHARED_SECRET` (ask whoever
runs the box). Then you only need terminal 3. Switch back by restoring the
local URL. That is the only difference between the two modes.

## The API

Every backend route except `/health` takes `Authorization: Bearer <key>`, where
the key is `API_SHARED_SECRET` (the frontend) or `TEAM_API_KEY` (people and
scripts).

| Route | Returns |
| --- | --- |
| `GET /health` | `{"status":"ok","database":"up"}` |
| `GET /ai/models` | `{ models: [{ id, provider, model }] }` — the aliases you can send |
| `POST /ai/chat` | `{ model, messages, system?, maxTokens? }` → `{ text, model, stopReason, usage, costUsd }` |

```bash
curl -s 127.0.0.1:8091/ai/chat -H "authorization: Bearer $TEAM_API_KEY" \
  -H 'content-type: application/json' \
  -d '{"model":"claude-fast","messages":[{"role":"user","content":"hello"}]}'
```

Aliases live in `proxy/proxy.yaml`: `default`, `claude`, `claude-fast` (Claude
Code subscription: Sonnet, Opus, Haiku), `qwen`, `qwen-small`, `qwen-large`
(Ollama), `test` (echo). `costUsd` on the subscription rail is what the call
*would* have cost via the API; nothing is billed. `qwen-small` narrates its
reasoning in the answer; prefer `qwen` for real use.

## Day to day

| I want to | Do |
| --- | --- |
| add an alias or model | edit `proxy/proxy.yaml`, restart `./start.sh` |
| add a table | add `backend/db/migrations/NNN_name.sql`, run `pnpm db:migrate` |
| add a backend route | `backend/src/app.ts`; call it from `frontend/lib/api-client.ts` |
| check types | `pnpm type-check` in `frontend/` or `backend/`; `pytest` in `proxy/` |
| see the proxy's view of a call | `curl -i` it: every response carries `X-LLM-Proxy-*` headers |

## Deploying

Push to `main`. Vercel builds `frontend/`; GitHub Actions type-checks all
three packages and publishes the backend image; the Monash box pulls it and
runs the proxy from the same checkout. Box setup and runbook:
[deploy/README.md](./deploy/README.md).

The deployed page is public with no sign-in. Do not share the Vercel URL
outside the team until a gate is added.

## Rules

- Never delete, truncate or drop anything in any database without asking.
  Schema changes are additive migration files.
- Secrets never go in git. `.env*` is ignored; `.env.example` files hold
  placeholders only.

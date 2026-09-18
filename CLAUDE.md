# Retina

Monorepo. Three independent packages:

- `frontend/` Next.js 16, on Vercel. Read `frontend/AGENTS.md` before writing Next code.
- `backend/` Express + Postgres, on the Monash server behind ngrok.
- `proxy/` Python. Anthropic-wire gateway to `claude -p` and Ollama.
- `emails/` The hackathon inbox: a FastAPI server in `emails/server` that
  serves the synthetic dataset in `emails/data_v2`. The backend reads it
  over HTTP. Do not edit the dataset by hand; `data_v2/generate.py` makes it.

Setup, ports, aliases and the API are in README.md. The server is in
deploy/README.md. Run commands inside a package, never at the root.

## Rules

- Keep it simple. Do not add what is not needed.
- The proxy's HTTP contract is fixed: `POST /v1/messages` (Anthropic wire),
  `GET /v1/models`, `GET /healthz`, `X-LLM-Proxy-*` headers. The backend
  depends on it. Change both sides or neither.
- Aliases in `proxy/proxy.yaml` are model names (`haiku`, `qwen3:14b`). Do not
  invent names.
- Never delete, truncate, drop or overwrite anything in any database, local or
  production, unless the user asked or approved first. Schema changes are new
  files in `backend/db/migrations/`.
- No secrets in git.

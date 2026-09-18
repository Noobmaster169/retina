# Ground rules

Retina is a monorepo of three independent packages: `frontend/` (Next.js, on
Vercel), `backend/` (Express + Postgres, on the Monash server behind an ngrok
tunnel), `proxy/` (Python llm-proxy: Claude Code subscription via `claude -p`
and local Qwen via Ollama). README.md has setup and the API; deploy/README.md
has the box.

Run commands inside a package, never at the root. Keep things simple; do not
add what is not needed. The proxy's HTTP contract (`/v1/messages` on the
Anthropic wire, `/v1/models`, `/healthz`, `X-LLM-Proxy-*` headers) is what
the backend depends on — change it in both places or not at all.

## Never destroy data without approval

Do not delete, truncate, drop, or overwrite anything in any database — local,
test, or production — unless the user explicitly asked, or you asked first and
they approved. This covers DELETE, TRUNCATE, DROP and destructive UPDATE. The
local dev database counts exactly as much as production. Schema changes are
additive SQL files in backend/db/migrations/, applied by db/migrate.mjs.

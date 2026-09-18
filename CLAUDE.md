# Ground rules

Retina is a template: a Next.js frontend on Vercel, an Express API + Postgres
on the Monash server behind an ngrok tunnel, models via an llm-proxy on that
server (Claude Code subscription and local Qwen). README.md has the layout and
the API; deploy/README.md has the box.

`frontend/` and `backend/` are independent pnpm packages. Run pnpm inside one
of them, never at the root. Keep things simple; do not add what is not needed.

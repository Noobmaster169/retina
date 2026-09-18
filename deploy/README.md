# Backend on the Monash server

The school server (`student@118.139.133.14`, reachable via `../../vps/monash.sh`
from the dev machine) hosts the API, Postgres and llm-proxy. It is the box with
the GPU (Ollama, Qwen 3) and the Claude Code login, and its firewall blocks
every inbound connection — so the API is published through an outbound ngrok
tunnel, and deploys are pulled by cron rather than pushed.

What runs here:

| Piece | How | Listens on |
| --- | --- | --- |
| Postgres 17 | `docker compose` service | `127.0.0.1:5434` |
| retina API | `docker compose` service, host network | `127.0.0.1:8091` (and the tunnel) |
| llm-proxy | systemd user service, Python venv | `127.0.0.1:4000` |
| Ollama | `monash-ollama` container (pre-existing) | `127.0.0.1:11434` |
| ngrok | `run-ngrok.sh` restart loop | outbound only |

The API is the only thing behind the tunnel, and its two bearer keys are the
only auth in front of the proxy. Never bind the proxy or Ollama wider than
loopback.

## First-time setup

### 1. This repo

```bash
mkdir -p ~/projects && cd ~/projects
git clone git@github.com:Noobmaster169/retina.git
```

The clone needs a read-only deploy key and `~/.ssh/config` routing GitHub over
443 (the firewall blocks 22). If yt-engine's setup is already on the box the
config exists; add a second `IdentityFile` for the retina deploy key or reuse a
user-level key:

```
Host github.com
    Hostname ssh.github.com
    Port 443
    User git
    IdentityFile ~/.ssh/github
    IdentitiesOnly yes
```

### 2. llm-proxy

```bash
cd ~ && git clone git@github.com:Noobmaster169/me-gpt.git llm-proxy
cd ~/llm-proxy && python3 -m venv .venv && .venv/bin/pip install -e .
```

If the clone is refused (deploy keys are per-repo), copy it from the dev
machine instead:

```bash
rsync -a --exclude .venv --exclude '*.db*' --exclude '*.jsonl' \
  -e "sshpass -f ~/.ssh/monash-vps.password ssh -o PubkeyAuthentication=no" \
  ~/ai/tools/llm-proxy/ student@118.139.133.14:llm-proxy/
```

### 3. Claude Code on the box

```bash
curl -fsSL https://claude.ai/install.sh | bash     # or: npm i -g @anthropic-ai/claude-code
claude                                              # first run: follow the login URL, paste the code
claude -p "say ok" --model haiku                    # proves the subscription works headless
```

The login is the student user's; `claude -p` inherits it. The proxy runs as
that same user, which is why it is a systemd *user* unit.

### 4. The proxy config and service

```bash
mkdir -p ~/retina && cp ~/projects/retina/deploy/proxy.yaml ~/retina/
docker exec monash-ollama ollama list          # confirm the qwen tags in proxy.yaml exist
mkdir -p ~/.config/systemd/user
cp ~/projects/retina/deploy/llm-proxy.service ~/.config/systemd/user/
systemctl --user daemon-reload && systemctl --user enable --now llm-proxy
loginctl enable-linger student
curl -s 127.0.0.1:4000/healthz
curl -s 127.0.0.1:4000/v1/messages -H 'content-type: application/json' -H 'x-api-key: smoke' \
  -d '{"model":"test","max_tokens":20,"messages":[{"role":"user","content":"ping"}]}'
```

### 5. The stack

```bash
cd ~/retina
cp ~/projects/retina/deploy/{compose.yaml,.env.example,auto-deploy.sh,run-ngrok.sh} .
cp .env.example .env && vi .env      # PG_PASSWORD, API_SHARED_SECRET, TEAM_API_KEY
chmod +x auto-deploy.sh run-ngrok.sh
docker login ghcr.io -u Noobmaster169   # classic PAT, read:packages — or skip and build from source
docker compose pull && docker compose up -d
curl -s 127.0.0.1:8091/health                                   # {"status":"ok","database":"up"}
curl -s -H "authorization: Bearer $TEAM_API_KEY" 127.0.0.1:8091/ai/models
```

Migrations run inside the API container before it listens (see the `CMD` in
`backend/Dockerfile`); there is no separate migration step.

### 6. The tunnel

Create a second static domain in an ngrok account (one static domain per free
account), then:

```bash
vi ~/retina/run-ngrok.sh            # set NGROK_DOMAIN
setsid nohup ~/retina/run-ngrok.sh >/dev/null 2>&1 </dev/null &
crontab -e
#   @reboot /home/student/retina/run-ngrok.sh
#   */3 * * * * /home/student/retina/auto-deploy.sh
curl -s https://<your-domain>.ngrok-free.dev/health
```

Put the same hostname in the Vercel project as `BACKEND_URL` (see ../README.md).

## Calling the API as a teammate

```bash
export RETINA_URL=https://<your-domain>.ngrok-free.dev
export TEAM_API_KEY=...          # from whoever runs the box

curl -s -H "authorization: Bearer $TEAM_API_KEY" $RETINA_URL/ai/models
curl -s -H "authorization: Bearer $TEAM_API_KEY" -H 'content-type: application/json' \
  -d '{"model":"qwen","messages":[{"role":"user","content":"Explain Docker volumes in two sentences."}]}' \
  $RETINA_URL/ai/chat
curl -s -H "authorization: Bearer $TEAM_API_KEY" "$RETINA_URL/activity?limit=20"
```

`/ai/chat` takes `{ model, messages, system?, maxTokens? }` and returns
`{ text, model, stopReason, usage, costUsd }`. Aliases come from `/ai/models`:
`claude`, `claude-fast`, `default` (subscription), `qwen`, `qwen-small`,
`qwen-large` (local), `test` (echo). Non-streaming; a cold `qwen-large` can take
a minute on the first call.

## Deploying a new version

Automatic: `auto-deploy.sh` runs from cron every 3 minutes and redeploys when
`origin/main` moves. It refuses a dirty clone, fast-forwards only, builds (or
pulls with `USE_REGISTRY=1`), recreates `api`, polls `/health` for 90 s and
rolls back to the previous image on failure. It never touches Postgres or the
proxy. Watch it: `tail -20 ~/retina/auto-deploy.log`.

## Looking around

```bash
docker compose ps
docker compose logs -f api
docker compose exec postgres psql -U retina retina_prod
journalctl --user -u llm-proxy -f
curl -s 127.0.0.1:4000/admin/usage          # spend and calls, split by project (retina-frontend / retina-team)
tail -f ~/retina/ngrok.log
```

## If something goes wrong

- **`/ai/chat` returns 503 "llm-proxy unreachable"** — `systemctl --user status llm-proxy`; if it is down, `journalctl --user -u llm-proxy -n 50`.
- **`claude` aliases fail, qwen works** — the login expired: run `claude` interactively as student, then restart the proxy.
- **qwen aliases 404 from the proxy** — the Ollama tag in `proxy.yaml` does not exist: `docker exec monash-ollama ollama list`.
- **Frontend shows "Backend unreachable"** — check the tunnel log, then `curl https://<domain>/health` from anywhere.

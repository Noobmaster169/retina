# The backend on the Monash server

`student@118.139.133.14`, reachable from the dev machine with
`../../vps/monash.sh '<command>'`. Its firewall blocks every inbound
connection, so the API is published through an outbound ngrok tunnel and
deploys are pulled by cron rather than pushed.

What runs here for retina, next to the yt-engine stack that was there first:

| Piece | How | Listens on |
| --- | --- | --- |
| Postgres 17 | compose service, private network | — |
| retina API | compose service | `127.0.0.1:8091` (and the tunnel) |
| llm-proxy | **shared with yt-engine**: `~/projects/llm-proxy`, run by `~/yt-engine/run-llm-proxy.sh` | `172.17.0.1:4000` (Docker bridge) |
| Ollama | `monash-ollama` container | `127.0.0.1:11434` |
| ngrok | `~/retina/run-ngrok.sh` | outbound only |

The API's two bearer keys are the only auth in front of the proxy, which
authenticates nobody. Never bind the proxy or Ollama wider than they are.

## First-time setup

### 1. Clone

Retina has its own read-only deploy key, `~/.ssh/retina-deploy`, with an SSH
host alias so it never collides with yt-engine's key:

```
Host github.com-retina
    Hostname ssh.github.com          # 443: the firewall blocks 22
    Port 443
    User git
    IdentityFile ~/.ssh/retina-deploy
    IdentitiesOnly yes
```

```bash
git clone git@github.com-retina:Noobmaster169/retina.git ~/projects/retina
```

### 2. Qwen aliases in the shared proxy

`~/projects/llm-proxy/config/proxy.yaml` already has the `ollama` provider;
add the aliases under `model_list` (tags must match
`docker exec monash-ollama ollama list`):

```yaml
  - model_name: qwen
    params: { model: ollama/qwen3:14b-ctx16k, max_tokens: 8000 }
  - model_name: qwen-small
    params: { model: ollama/qwen3:4b-ctx16k, max_tokens: 8000 }
  - model_name: qwen-large
    params: { model: ollama/qwen3.8:27b-ctx16k, max_tokens: 8000 }
```

Restart by killing the uvicorn process; the runner loop restarts it in 5 s:
`pkill -f "uvicorn llm_proxy"`, then `curl -s 172.17.0.1:4000/healthz`.

### 3. The stack

```bash
mkdir -p ~/retina && cd ~/retina
cp ~/projects/retina/deploy/{compose.yaml,.env.example,auto-deploy.sh,run-ngrok.sh} .
cp .env.example .env && vi .env          # PG_PASSWORD, API_SHARED_SECRET, TEAM_API_KEY (openssl rand -hex 32)
chmod +x auto-deploy.sh run-ngrok.sh
docker build -t ghcr.io/noobmaster169/retina-api:main ~/projects/retina/backend   # or docker compose pull, once logged in to GHCR
docker compose up -d
curl -s 127.0.0.1:8091/health                                          # {"status":"ok","database":"up"}
curl -s -H "authorization: Bearer $TEAM_API_KEY" 127.0.0.1:8091/ai/models
```

Migrations run inside the API container before it listens.

### 4. The tunnel

ngrok's free plan gives one static domain per account, and yt-engine's tunnel
uses this account's. Retina needs a second account's authtoken in its own
config file so the two agents do not share state:

```bash
ngrok config add-authtoken <token> --config ~/retina/ngrok.yml
vi ~/retina/run-ngrok.sh                  # NGROK_DOMAIN = the new account's static domain
setsid nohup ~/retina/run-ngrok.sh >/dev/null 2>&1 </dev/null &
curl -s https://<domain>.ngrok-free.dev/health
```

### 5. Cron

```
@reboot setsid nohup /home/student/retina/run-ngrok.sh >/dev/null 2>&1 </dev/null &
*/3 * * * * /home/student/retina/auto-deploy.sh
```

Then set `BACKEND_URL` and `API_SHARED_SECRET` in the Vercel project.

## Deploying a new version

`auto-deploy.sh` runs every 3 minutes and redeploys when `origin/main` moves:
refuses a dirty clone, fast-forwards only, builds from `backend/` (or pulls
with `USE_REGISTRY=1`), recreates `api`, polls `/health` for 90 s and rolls
back to the previous image on failure. It never touches Postgres or the
proxy. `tail -20 ~/retina/auto-deploy.log`.

## Calling the API as a teammate

```bash
export RETINA_URL=https://<domain>.ngrok-free.dev TEAM_API_KEY=...
curl -s -H "authorization: Bearer $TEAM_API_KEY" $RETINA_URL/ai/models
curl -s -H "authorization: Bearer $TEAM_API_KEY" -H 'content-type: application/json' \
  -d '{"model":"qwen","messages":[{"role":"user","content":"Explain Docker volumes in two sentences."}]}' \
  $RETINA_URL/ai/chat
```

Aliases: `subscription`, `subscription-sonnet`, `subscription-haiku` (Claude
Code subscription), `qwen`, `qwen-small`, `qwen-large` (local GPU), `test`
(echo), plus whatever else the shared proxy serves. Non-streaming; a cold
`qwen-large` can take a minute on the first call.

## Looking around

```bash
cd ~/retina && docker compose ps && docker compose logs -f api
docker compose exec postgres psql -U retina retina_prod
tail -f ~/yt-engine/llm-proxy.log                 # the shared proxy
curl -s 172.17.0.1:4000/admin/usage               # spend by project: retina-frontend / retina-team
tail -f ~/retina/ngrok.log
```

- **503 "llm-proxy unreachable"** — `pgrep -af uvicorn`; if gone, `setsid nohup ~/yt-engine/run-llm-proxy.sh >/dev/null 2>&1 </dev/null &`.
- **`subscription*` fail, qwen works** — the Claude login expired: run `claude` interactively as student.
- **Frontend says "Backend unreachable"** — `tail ~/retina/ngrok.log`, then `curl https://<domain>/health` from anywhere.

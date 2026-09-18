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
| llm-proxy | `proxy/` from the clone at `~/projects/retina`, run on the host by `~/retina/run-proxy.sh` | `172.17.0.1:4001` (Docker bridge; yt-engine's own proxy is on 4000) |
| Ollama | `monash-ollama` container, pre-existing | `127.0.0.1:11434` |
| ngrok | `~/retina/run-ngrok.sh` | outbound only |

Directories: `~/projects/retina` is the git clone (code); `~/retina` is the
running stack (compose, `.env`, runner scripts, logs).

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

### 2. The proxy

The proxy shells out to `claude`, which lives under nvm for the `student`
user and is already logged in (`claude -p "say ok"` works in a shell). Ollama
serves the Qwen tags on loopback. `proxy/proxy.yaml` is committed; on this box
the two Qwen tags are the `-ctx16k` profiles, so check `docker exec
monash-ollama ollama list` matches what the config names.

```bash
# The system python3 has no venv module and there is no sudo; miniforge's does.
cd ~/projects/retina/proxy && ~/miniforge3/bin/python3 -m venv .venv && .venv/bin/pip install -e .
cp ~/projects/retina/deploy/run-proxy.sh ~/retina/ && chmod +x ~/retina/run-proxy.sh
setsid nohup ~/retina/run-proxy.sh >/dev/null 2>&1 </dev/null &
sleep 5 && curl -s 172.17.0.1:4001/healthz
curl -s 172.17.0.1:4001/v1/messages -H 'content-type: application/json' -H 'x-api-key: smoke' \
  -d '{"model":"qwen3:4b","max_tokens":20,"messages":[{"role":"user","content":"Say hi in one word."}]}'
```

`auto-deploy.sh` reinstalls and restarts it whenever a push touches `proxy/`.
By hand: `pkill -f "^\.venv/bin/python -m uvicorn llm_proxy.*--port 4001"`; the
runner restarts it in 5 s. (start.sh execs `.venv/bin/python` by relative path,
and yt-engine's proxy has the same command line on port 4000 — hence the
anchor and the port. An unanchored `pkill -f` whose pattern appears in your own
ssh command line kills your session.)

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
@reboot setsid nohup /home/student/retina/run-proxy.sh >/dev/null 2>&1 </dev/null &
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
  -d '{"model":"qwen3:14b","messages":[{"role":"user","content":"Explain Docker volumes in two sentences."}]}' \
  $RETINA_URL/ai/chat
```

Aliases come from `proxy/proxy.yaml`: `sonnet`, `opus`, `haiku`
(Claude Code subscription), `qwen3:14b`, `qwen3:4b`, `qwen3.8:27b` (local GPU),
`test` (echo). Non-streaming; a cold `qwen3.8:27b` can take a minute on the
first call.

## Looking around

```bash
cd ~/retina && docker compose ps && docker compose logs -f api
docker compose exec postgres psql -U retina retina_prod
tail -f ~/retina/llm-proxy.log
tail -f ~/retina/ngrok.log
```

- **503 "llm-proxy unreachable"** — `pgrep -af "port 4001"`; if gone, `setsid nohup ~/retina/run-proxy.sh >/dev/null 2>&1 </dev/null &` and read `~/retina/llm-proxy.log`.
- **`sonnet`/`opus`/`haiku` fail, qwen works** — the Claude login expired: run `claude` interactively as student.
- **Frontend says "Backend unreachable"** — `tail ~/retina/ngrok.log`, then `curl https://<domain>/health` from anywhere.

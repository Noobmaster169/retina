# The backend on the Monash server

`student@118.139.133.14`, reachable from the dev machine with
`../../vps/monash.sh '<command>'`. Its firewall blocks every inbound
connection, so the API is published through an outbound ngrok tunnel and
deploys are pulled by cron rather than pushed.

What runs here for retina, next to the yt-engine stack that was there first:

| Piece | How | Listens on |
| --- | --- | --- |
| Postgres 17 | compose service, private network | — |
| Redis 7 | compose service, AOF, noeviction. The BullMQ queues | private network, `redis:6379` |
| MinIO | compose service. Attachment bytes, one copy per run | private network, `minio:9000` (console `:9001`, tunnel only) |
| retina API | compose service | `127.0.0.1:8091` (and the tunnel) |
| retina worker | compose service, same image, `node --import tsx src/worker.ts` | — |
| inbox (email server) | compose service, built from `emails/server` in the clone, serving `emails/data_v2` | private network, `inbox:8000` |
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
serves the Qwen tags on loopback.

**Claude Code must be 2.1.274 or newer on this box.** Every pipeline step asks the
proxy for structured output, which it serves with `claude -p --json-schema`; an older
CLI does not have the flag and the proxy answers 502 rather than pass prose on. Check
with `claude --version`, and after an upgrade re-run the smoke call below with a schema. `proxy/proxy.yaml` is committed; on this box
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

One script does all of it, and is safe to run again:

```bash
cd ~/projects/retina && git pull      # only the first time, to get the script
bash deploy/bootstrap-wizard.sh
```

If that `git pull` refuses because the clone is dirty, look at what changed.
`pip install -e proxy` used to rewrite `proxy/src/retina_proxy.egg-info/`,
which was tracked, so the clone went dirty on its own and `auto-deploy.sh`
skipped every run after it. Those files are ignored now; restore them once
(`git restore proxy/src/retina_proxy.egg-info`) and the pull goes through. The
wizard does that check itself on every later run.

It installs `~/retina/compose.yaml` and `~/retina/auto-deploy.sh`, generates only
the secrets `~/retina/.env` is missing (it keeps every value already there, and
refuses to invent a `PG_PASSWORD` when the Postgres volume already exists,
which would lock the data away), rebuilds the api image from the clone, brings
the stack up, adds the cron lines that are absent, and prints the day-one checks
for `docs/PROGRESS.md`.

It rebuilds every time rather than trusting the `:main` tag, because the tag on
this box can be an image from long before the clone's HEAD, and starting that
under a new compose file gives you a stack that looks up and serves old code.

```bash
curl -s 127.0.0.1:8091/health    # {"status":"ok","checks":{"postgres":"up","redis":"up","minio":"up","inbox":"up"}}
curl -s -H "authorization: Bearer $TEAM_API_KEY" 127.0.0.1:8091/ai/models
curl -s -H "authorization: Bearer $TEAM_API_KEY" '127.0.0.1:8091/emails?limit=1'
```

Migrations run inside the API container before it listens. Only the api runs
them: the worker replaces the image's command, so there is no second migrator
to order around. The compose file reaches the clone by relative path
(`../projects/retina`), so `~/retina` and `~/projects/retina` must stay
siblings.

After this, `~/retina/compose.yaml` and `~/retina/auto-deploy.sh` are kept in
step with the clone by `auto-deploy.sh` itself. `~/retina/.env` is the one file
nothing copies: a new variable has to be added there, which is what re-running
the wizard does.

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
refuses a dirty clone, fast-forwards only, refreshes `~/retina/compose.yaml`
and itself from the clone, builds from `backend/` (or pulls with
`USE_REGISTRY=1`), recreates `api` and `worker`, polls `/health` for two
minutes and rolls back the image, and the compose file it replaced, on
failure. It never touches Postgres. `tail -20 ~/retina/auto-deploy.log`.

The health gate is `postgres` and `redis` up, not `"status":"ok"`. The report
is `degraded` whenever any dependency is down, so gating on `ok` rolls back
working code because MinIO is restarting; a `minio` or `inbox` outage is logged
as a warning and the deploy stands.

A rollback recreates the api container, so the tunnel answers nothing for the
few seconds it takes to migrate and start listening. That is the cost of the
rollback, not a second fault.

A commit that adds a service is deployed by converging the whole stack
(`docker compose up -d`) rather than the usual `--no-deps api worker`, because
`--no-deps` would skip creating the new one.

Change these scripts with `deploy/sim/sim.sh`, not on the box:

```bash
cd deploy/sim && ./sim.sh up && ./sim.sh test
```

It runs the real `auto-deploy.sh` and `bootstrap-wizard.sh` against a replica
of this layout in Docker-in-Docker, including a deploy whose `/health` reports
Postgres down, so rollback is exercised somewhere a mistake is cheap. What it
cannot exercise: the host proxy on `172.17.0.1:4001`, the `claude` CLI, ngrok,
cron and this box's real `.env`.

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
docker compose logs -f worker                # the pipeline: one JSON line per stage
docker compose exec postgres psql -U retina retina_prod
docker compose exec redis redis-cli info memory
tail -f ~/retina/llm-proxy.log
tail -f ~/retina/ngrok.log
```

The MinIO console has no published port. Reach it through the tunnel you
already have:

```bash
ssh -L 9001:127.0.0.1:9001 student@118.139.133.14
# on the box, only while you are looking:
cd ~/retina && docker compose exec -T minio sh -c 'echo console on 9001'
```

MinIO's console is on the container's `:9001`, so the simplest route is to add
`ports: ["127.0.0.1:9001:9001"]` to the `minio` service, `docker compose up -d
minio`, look, then take it out again. Never leave it published.

- **503 "llm-proxy unreachable"** — `pgrep -af "port 4001"`; if gone, `setsid nohup ~/retina/run-proxy.sh >/dev/null 2>&1 </dev/null &` and read `~/retina/llm-proxy.log`.
- **`sonnet`/`opus`/`haiku` fail, qwen works** — the Claude login expired: run `claude` interactively as student.
- **502 "claude returned no structured_output"** — the CLI is older than 2.1.274 or the push that
  added `--json-schema` has not reached the box. `claude --version`, then `tail ~/retina/auto-deploy.log`.
- **A run sits at `ingested` and nothing moves** — the worker is the only thing that consumes queues: `docker compose ps worker`, `docker compose logs --tail=50 worker`, then `docker compose restart worker`. Jobs it was holding are marked stalled by BullMQ and re-run; job ids stop a stage from running twice.
- **Redis errors about memory (OOM command not allowed)** — the queues are `noeviction` on purpose, so Redis refuses writes rather than dropping jobs. `docker compose exec redis redis-cli info memory`, then either raise `--maxmemory` in `compose.yaml` or clear finished jobs. 520 emails is far under 512 MB, so this usually means a run loop, not real growth.
- **`/health` says `minio` is down** — `docker compose logs minio`. Attachments are the only thing that needs it: classification keeps working and a deploy is no longer rolled back for it, but ingest of a new run will fail.
- **Frontend says "Backend unreachable"** — `tail ~/retina/ngrok.log`, then `curl https://<domain>/health` from anywhere.
- **Inbox says "not reachable"** (API answers 503 on `/emails`) — `docker compose ps inbox`, `docker compose logs inbox`; `docker compose up -d --build inbox` rebuilds it.

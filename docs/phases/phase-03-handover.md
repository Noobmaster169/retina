# Phase 3 handover: deploying to the Monash box

Written 2026-09-19 for whoever has SSH access to `student@118.139.133.14`, and for the agent
helping them. Everything in this file has been exercised against a replica of that box
(`deploy/sim/`), never against the box itself, because the machine that built it cannot reach
the box.

Read `deploy/README.md` for what runs there and why. Read `docs/phases/phase-03-vps-deploy.md`
for what this phase changed. This file is the runbook for the one manual step.

## 1. What is true before you start

`main` holds phase 3. The box does not. Through the tunnel today:

```bash
curl -s https://purebred-shank-riptide.ngrok-free.dev/health
# {"status":"ok","database":"up"}          <- the OLD two-field shape
curl -s -o /dev/null -w '%{http_code}\n' -H "authorization: Bearer $TEAM_API_KEY" \
  https://purebred-shank-riptide.ngrok-free.dev/runs
# 404                                       <- a route main registers unconditionally
```

That is a pre-phase-1 image. Neither phase 1 (queues, storage, runs) nor phase 2 (LLM
classification, submission, scoring) is live there.

Two defects in the deploy scripts each produce exactly that, and both are fixed on `main`.
**Which one actually bit is unknown until someone reads `~/retina/auto-deploy.log`. Read it
first and record what it says**, because it decides nothing about the steps below but it is the
only evidence that will ever exist.

1. The health gate was `"status":"ok"`. Phase 1's `/health` answers `degraded` whenever Redis
   or MinIO is down, which on that box was always, so a phase 1 deploy came up, was read as a
   failure, and rolled itself back. Look for `HEALTH CHECK FAILED` and `rolling back to`.
2. `proxy/src/retina_proxy.egg-info/` was tracked, and `auto-deploy.sh` runs
   `pip install -e proxy` whenever a push touches `proxy/`. setuptools rewrites those files, so
   the clone dirties itself and the dirty-tree refusal skips every run after that. Look for
   `SKIP: working tree at ... is dirty`.

After the push of phase 3 to `main`, cron will have tried a deploy with the **old** script and
the **old** `~/retina/compose.yaml`, and that attempt will have failed and rolled back. That is
expected and harmless: it leaves the box where it already is. The bootstrap below is what
actually moves it.

## 2. The only manual step

```bash
ssh student@118.139.133.14
cd ~/projects/retina
git status --porcelain
```

If that prints anything under `proxy/src/retina_proxy.egg-info/`, restore it first. The commit
that untracks those files cannot apply over local modifications:

```bash
git restore proxy/src/retina_proxy.egg-info
```

If it prints anything **else**, stop and look at it. Someone was working on the box, and
nothing here is worth losing their work over.

Then:

```bash
git pull
bash deploy/bootstrap-wizard.sh
```

That is the whole step. It is safe to run again, and every later run it fast-forwards the clone
and restores generated files itself, so this `git pull` is only needed this once (it is how the
wizard gets onto the box at all).

## 3. What the wizard does, stage by stage

It clears the screen per stage and waits for Enter, so nothing scrolls away. Six stages:

1. **Prerequisites.** docker, compose, git, curl, openssl, the clone, the `claude` CLI version.
   It restores a clone dirtied by generated files, names anything else and stops, then
   fast-forwards.
2. **Stack files.** Installs `~/retina/compose.yaml` and `~/retina/auto-deploy.sh` from the
   clone, by rename, keeping the previous copy as `.previous`. After this, `auto-deploy.sh`
   keeps both in step with the clone on every deploy and nobody needs to log in again.
3. **Secrets.** `~/retina/.env` is the one file nothing ever copies. It keeps every value
   already there and generates only what is missing, which on this box should be exactly
   `MINIO_ACCESS_KEY` and `MINIO_SECRET_KEY`. **If it offers to generate `PG_PASSWORD`, stop.**
   It refuses on its own when the Postgres volume exists, but if you ever see it write that key
   on a box that already has data, the data is about to become unreachable.
4. **The stack.** Rebuilds the api image from the clone (always, never "only if absent": the
   `:main` tag on this box is an image from before phase 1), then `docker compose up -d`, then
   polls `/health`. Expect a few minutes on the first build.
5. **Cron.** Adds only the lines that are absent, and touches nothing already in the crontab.
   Four lines: auto-deploy every 3 minutes, the two `@reboot` runners, and the nightly
   `pg_dump` into `~/retina/backups/`.
6. **Day one checks.** The proxy's alias list, whether a call with a JSON schema really comes
   back constrained, 8 parallel calls, disk and memory. It prints these ready to paste into
   `docs/PROGRESS.md` under "Verified on the box". **Paste them there and commit**; phase 4
   needs them and nothing else will produce them.

## 4. Verify, in this order

```bash
# on the box
cd ~/retina
curl -s 127.0.0.1:8091/health
# {"status":"ok","checks":{"postgres":"up","redis":"up","minio":"up","inbox":"up"}}

docker compose ps
# postgres redis minio inbox api worker, all up. minio-init exited 0, which is correct.

docker compose ps --format '{{.Service}}  {{.Ports}}'
# exactly one host mapping, and it is 127.0.0.1:8091->8091/tcp on api.
# A bare "8000/tcp" or "6379/tcp" is the container port, not a published one. Fine.
```

```bash
# from anywhere
curl -s https://purebred-shank-riptide.ngrok-free.dev/health
# the four-check shape, every check "up"
```

The answer key must reach the inbox container and nothing else:

```bash
cd ~/retina
docker compose exec inbox ls -l /secrets/ground_truth.json    # exists
docker compose exec api ls /secrets 2>&1                      # must fail: no such directory
docker compose exec api printenv EVAL_GROUND_TRUTH_PATH 2>&1  # must print nothing
```

One backup by hand, so the cron line is known to work rather than assumed:

```bash
cd ~/retina && docker compose exec -T postgres pg_dump -U retina retina_prod \
  | gzip > backups/manual-$(date +%F).sql.gz && ls -lh backups/
```

## 5. A real run, end to end

Twenty emails, not all 520. A full run is 520 sonnet calls at 2 concurrent: roughly 40 minutes,
and it spends the subscription's limits. Twenty proves every seam.

Preferred: the Vercel page, `/runs`, because that also proves `BACKEND_URL`, the shared secret
and the password gate. Confirm in the Vercel project first that `BACKEND_URL`,
`API_SHARED_SECRET` and `SITE_PASSWORD` are set. There is no `SESSION_SECRET`; the gate derives
its cookie as an HMAC of `SITE_PASSWORD`.

By hand, if you would rather not use the page:

```bash
export RETINA_URL=https://purebred-shank-riptide.ngrok-free.dev
export TEAM_API_KEY=...          # from ~/retina/.env on the box

curl -s -X POST "$RETINA_URL/runs" \
  -H "authorization: Bearer $TEAM_API_KEY" -H 'content-type: application/json' \
  -d '{"source":"averis","ratePerSecond":2,"limit":20}'
# 201, a RunSummary: {"id":"...","status":"running","totalEmails":20,"stageCounts":{...},...}

curl -s "$RETINA_URL/runs/<id>" -H "authorization: Bearer $TEAM_API_KEY"
# poll it: stageCounts moves ingested -> classifying -> classified -> done.
# On the box, docker compose logs -f worker is the same thing with reasons.

curl -s -X POST "$RETINA_URL/runs/<id>/submit" -H "authorization: Bearer $TEAM_API_KEY"
# 201 with the scoreboard from the box's own inbox container.
# A 409 here is the API refusing a run that has unfinished emails, and it says how
# many of how many. Wait, or re-send with ?force=true if you mean it.
```

Twenty emails at 2/s ingest, then classify at 2 concurrent, is a few minutes. A score in the
region of 0.01 is correct for 20 of 520 emails: the organisers' scorer divides by the whole
inbox. The number to compare against is not the phase 2 score.

## 6. Then prove a push deploys

```bash
# from a dev machine: any trivial commit on main, e.g. a line in deploy/README.md
# then on the box, within 5 minutes:
tail -20 ~/retina/auto-deploy.log
# new commit <sha> — deploying
# DEPLOYED <sha> — healthy
```

If that works, phase 3 is done and every later phase is a `git push`.

## 7. Failure modes, and what each one means

| What you see | What it is | What to do |
|---|---|---|
| `SKIP: working tree at ... is dirty` | Something rewrote a file in the clone | `git -C ~/projects/retina status --porcelain`. Generated files: restore them. Anything else: find out who was working there |
| `docker compose up` errors on `MINIO_ACCESS_KEY` | `~/retina/.env` is missing a variable | Re-run the wizard; it adds only what is missing |
| `HEALTH CHECK FAILED` then `rolling back to` | The deploy's `/health` never reported postgres and redis up within two minutes | `docker compose logs --tail=50 api`. The bad commit stays checked out, so fix and push again; the next tick will not retry on its own |
| `/health` says `minio` down | MinIO is not serving | `docker compose logs minio`. Classification keeps working; ingesting a new run will not |
| A run sits at `ingested` | The worker is the only thing that consumes queues | `docker compose ps worker`, `docker compose logs --tail=50 worker`, `docker compose restart worker`. Stalled jobs re-run; job ids stop a stage running twice |
| `503 llm-proxy unreachable` | The host proxy on 4001 is down | `pgrep -af "port 4001"`, then `setsid nohup ~/retina/run-proxy.sh >/dev/null 2>&1 </dev/null &`, then `tail ~/retina/llm-proxy.log` |
| `502 claude returned no structured_output` | The `claude` CLI is older than 2.1.274 | `claude --version`, upgrade, re-run the wizard's stage 6 check |
| `sonnet` fails but `qwen` works | The Claude login expired | Run `claude` interactively as `student` |

## 8. Things that must not happen

- Do not publish a port other than `127.0.0.1:8091`. The MinIO console is worth a temporary
  `127.0.0.1:9001:9001` while you look, and taking it out again afterwards.
- Do not copy `ground_truth.json` anywhere. It is committed in `emails/data_v2/` as part of the
  organiser kit and compose mounts it into `inbox` only. Do not set `EVAL_GROUND_TRUTH_PATH` on
  the box.
- Do not `docker compose down -v` on the box. That deletes the Postgres, Redis and MinIO
  volumes. `down` alone is already enough to stop everything.
- Do not change `PG_PASSWORD` in `~/retina/.env` while the Postgres volume exists.
- Do not edit `~/retina/compose.yaml` or `~/retina/auto-deploy.sh` on the box. Both are
  overwritten from the clone on the next deploy, so an edit there is lost and, worse, works
  until it is. Change `deploy/` in the repo and push.

## 9. Changing a deploy script

Not on the box, and not by pushing and hoping. The simulator runs the real scripts against a
replica of this layout:

```bash
cd deploy/sim && ./sim.sh up && ./sim.sh test
```

It covers bootstrap by the wizard, a quiet tick, a new commit, a commit that changes
`compose.yaml` and `auto-deploy.sh` together, a commit whose `/health` reports Postgres down
(so rollback is exercised), and a dirty clone. 15 assertions, about three minutes after the
first run. `./sim.sh shell` puts you inside it, laid out like the box. `./sim.sh reset` forgets
the simulated box without dropping the image cache.

It found three real bugs in the scripts before they ever reached the box. It cannot exercise
the host proxy on `172.17.0.1:4001`, the `claude` CLI, ngrok, cron, or this box's real `.env`.

## 10. What to write down when you are finished

In `docs/PROGRESS.md`:

- The day-one block the wizard printed, under "Verified on the box", replacing the four
  `unknown` lines.
- Which of the two defects in section 1 the `auto-deploy.log` actually shows.
- The 20-email run's id and its `final_score`.
- Tick the open boxes in the "Phase 3 (in progress)" checklist, and change the heading to
  `(done, <date>, on the box)`.

Then phase 4 can start, and it starts by reading those day-one numbers.

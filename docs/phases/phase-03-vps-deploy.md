# Phase 3: VPS deploy and Vercel

## Goal

The phase 2 system runs on the Monash box and is reachable through the Vercel URL. Every
later phase then ships with `git push`. Doing this while the system is small surfaces
infrastructure problems (tunnel, image size, memory, the inbox mount) before they can block a
feature phase.

## Prerequisites

- Phase 2 merged to `main`.
- Retina's box setup already done per `deploy/README.md`: deploy key, `~/retina/.env`, ngrok
  account and static domain, cron lines, GHCR image publishing in GitHub Actions.
- Access to the box as `student@118.139.133.14`. Nobody on the dev machine needs it for the
  code: the deploy is pulled by cron, and `deploy/sim/` exercises the scripts locally. It is
  needed once, to run the bootstrap wizard.

## Scope

In: compose for production, auto-deploy changes, the inbox on the box, Vercel env, CI gates,
runbook. Out: pipeline changes of any kind.

## What was already wrong

The box served a pre-phase-1 image: `GET /runs` answered 404 through the tunnel and `/health`
returned the old `{"status":"ok","database":"up"}` shape. `auto-deploy.sh` gated a deploy on
`"status":"ok"`, and phase 1's `/health` answers `degraded` whenever Redis or MinIO is down,
which on that box was always. So every phase 1 deploy came up, was read as a failure, and
rolled itself back. Fixing the gate comes before adding services, or the same thing eats this
phase's deploy.

## Work items

### 1. `deploy/compose.yaml`

Services: `postgres`, `redis`, `minio`, `minio-init`, `inbox`, `api`, `worker`. Only `api`
publishes a port, `127.0.0.1:8091`. `api` and `worker` share one YAML anchor for their
environment so the two cannot drift. `worker` runs `node --import tsx src/worker.ts` (the image
has no build step) and waits for `api` healthy, so only one container ever migrates.

The answer key is not placed on the box by hand. `emails/data_v2/ground_truth.json` is
committed as part of the organiser kit, and compose mounts it read-only into `inbox` and
nothing else.

### 2. Backend Dockerfile

Unchanged. It runs TypeScript through tsx rather than building to `dist/`, so the worker's
command is `node --import tsx src/worker.ts`. `wget` is present in the alpine base for the
healthcheck.

### 3. `deploy/.env.example`

`MINIO_ACCESS_KEY` and `MINIO_SECRET_KEY` join the two bearer keys and `PG_PASSWORD`.
Everything else the backend reads either has a default in `config.ts` or names a compose
service and is set in `compose.yaml`. There is no `DATABASE_URL`: `config.ts` takes discrete
`PG_*` variables, which is the house convention.

`EVAL_GROUND_TRUTH_PATH` stays out on purpose, so copying the file cannot hand the api the
answer key.

### 4. `deploy/auto-deploy.sh`

1. The health gate is `checks.postgres == "up"` and `checks.redis == "up"`, for two minutes.
   A `minio` or `inbox` outage is logged as a warning and the deploy stands.
2. It copies `~/retina/compose.yaml` and `~/retina/auto-deploy.sh` from the clone on every
   run, by rename rather than in place (bash reads a script as it executes it). After
   replacing itself it hands over with `exec`, carrying the commit it started from in
   `AUTO_DEPLOY_FROM`, so the new logic deploys the commit that brought it and still sees
   what changed.
3. A compose change converges every service (`docker compose up -d`); otherwise it recreates
   `api` and `worker` with `--no-deps`. `--no-deps` would skip creating a service that the
   commit just added.
4. Rollback restores the previous image and the previous `compose.yaml`.
5. Unchanged: flock, the dirty-clone refusal, fast-forward only, the proxy reinstall, the
   inbox rebuild when `emails/server` changed, `USE_REGISTRY` (0 on this box: it builds from
   the clone).

It never writes `~/retina/.env`. A new secret is a wizard run.

### 5. `deploy/bootstrap-wizard.sh`

The one manual step, and the last one: `~/retina/compose.yaml` and `~/retina/auto-deploy.sh`
are copies, and the copy on the box cannot update itself until it is the version that knows
how to. Run on the box, safe to re-run:

```bash
cd ~/projects/retina && git pull
bash deploy/bootstrap-wizard.sh
```

Six stages: prerequisites, the two stack files, secrets (generated only when missing; it
refuses to invent a `PG_PASSWORD` when the Postgres volume already exists, which would lock
the data away), the stack up and `/health` polled, the four cron lines including the nightly
`pg_dump`, and the day-one checks phase 4 needs, printed ready for `PROGRESS.md`.

### 6. `deploy/sim/`

A Docker-in-Docker replica of the box layout: `/srv/origin.git` stands in for GitHub,
`~/projects/retina` is the clone, `~/retina` is the stack, so the relative paths in
`compose.yaml` resolve exactly as they do on the box. `./sim.sh test` runs the real scripts
through bootstrap, a quiet tick, a new commit, a commit that changes `compose.yaml` and
`auto-deploy.sh` together, a commit whose `/health` reports Postgres down, and a dirty clone.

Not in the original plan. It is here because the dev machine cannot SSH into the box, so a
wrong script costs a manual recovery, and because the bug in "What was already wrong" is
exactly the kind a test like this catches.

### 7. Vercel

Project already exists with Root Directory `frontend`. Env: `BACKEND_URL`,
`API_SHARED_SECRET`, `SITE_PASSWORD`. There is no `SESSION_SECRET`: the gate derives its
cookie as an HMAC of `SITE_PASSWORD`. `api-client.ts` sends `ngrok-skip-browser-warning: 1`
so the free-tier interstitial can never answer instead of the API.

### 8. GitHub Actions

The gates (`quality`, `test`, `proxy`) also run on a pull request, which is the only way to
see the workflow go green before it decides whether `main` publishes. `test` runs the backend
suite against a Postgres service container on 5433, the port `vitest.config.ts` names;
everything else the suite touches has a fake. `quality` adds `pnpm build` for the frontend.
`build-api` publishes on pushes only.

### 9. Runbook: `deploy/README.md`

New services and their logs, the wizard as the setup path, the health gate, a stuck worker,
Redis under `noeviction`, a MinIO outage, and the MinIO console through an SSH tunnel.

## Tests

No new unit tests: nothing in `backend/src` changed. `deploy/sim/sim.sh test` is this phase's
test, and CI must be green on the pull request before merge.

## Manual verification

- Start a run of 20 emails from the Vercel page; watch counts on the page; confirm on the
  box with `docker compose logs -f worker`.
- Submit that run from the page and read the score.
- Push a trivial commit; within 5 minutes `auto-deploy.log` shows pull, up, health ok.
- Rollback is exercised in the simulator, not on the box.

## Exit checklist

- [ ] `https://<domain>/health` reports every check up.
- [ ] A run started from the Vercel page completes on the box and scores through the box's inbox.
- [ ] A push to `main` deploys within 5 minutes without manual steps.
- [ ] `./sim.sh test` is green, rollback included.
- [ ] `docker compose ps` on the box publishes only `127.0.0.1:8091`.
- [ ] `ground_truth.json` reaches the `inbox` container and nothing else.
- [ ] Nightly backup cron line present; one manual `pg_dump` succeeded.
- [ ] CI green on the pull request.
- [ ] `deploy/README.md` updated; `PROGRESS.md` updated.

## Hand-off notes for phase 4

The wizard's last stage runs the day-one checks and prints them for `PROGRESS.md`: the proxy's
alias list, whether a request with a JSON schema really comes back constrained (which needs
`claude` 2.1.274 or newer on the box), and how 8 parallel requests fare. Whether the proxy
forwards an image content block is still open, and phase 5 is when it matters.

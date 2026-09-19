#!/usr/bin/env bash
#
# Pull-based continuous deployment for the Monash backend.
#
# GitHub runners cannot SSH into this box: the university firewall blocks
# inbound connections, which is why the API is reached through an outbound
# ngrok tunnel. So deployment cannot be pushed here; the box has to reach out
# and fetch. Cron runs this, it checks origin/main, and it redeploys only when
# the commit actually changed.
#
# Install (once, by deploy/bootstrap-wizard.sh):
#   cp auto-deploy.sh ~/retina/ && chmod +x ~/retina/auto-deploy.sh
#   crontab -e   ->   */3 * * * * /home/student/retina/auto-deploy.sh
# After that this script keeps ~/retina/compose.yaml and ~/retina/auto-deploy.sh
# in step with the clone itself, so a commit that adds a service reaches the box
# without anyone logging in. It never writes ~/retina/.env: secrets are the
# wizard's job, and a missing one is a loud failure rather than a silent default.
#
# Two ways to get the image, chosen by USE_REGISTRY:
#   0 (default) build from the source we just pulled. Needs no registry
#     credentials, which is why it is the default: the deploy key is
#     read-only and that is all a source build requires.
#   1 pull the image CI already built and pushed. Better once the box is
#     logged in to GHCR (docker login ghcr.io), because CI has type-checked
#     and tested that image and this box has not.
#
# Safety properties, in order of how much they matter:
#   - a failed build never touches the running container
#   - a deploy that fails its health check is rolled back to the previous image,
#     which is kept tagged as :previous so pruning cannot remove it, and to the
#     previous compose.yaml when this run replaced it
#   - two runs cannot overlap (flock)
#   - a dirty or diverged clone aborts rather than being force-reset
#
# It never touches Postgres. Migrations are the API container's job, run on
# startup by the CMD in backend/Dockerfile.
#
# Exercised without the box by deploy/sim/: a Docker-in-Docker replica of this
# layout. Change this script, run deploy/sim/sim.sh test, then push.

set -uo pipefail

# cron gets a minimal PATH and would not otherwise find docker.
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

REPO="${REPO:-$HOME/projects/retina}"
# shellcheck source=lib/stack.sh
. "$REPO/deploy/lib/stack.sh" 2>/dev/null || {
  echo "auto-deploy: cannot read $REPO/deploy/lib/stack.sh; is REPO right?" >&2
  exit 1
}
retina_stack_defaults
# Both run the same image. The api migrates and serves; the worker consumes queues.
SERVICES="${SERVICES:-api worker}"
# Tries are 2 s apart. The api migrates before it listens, and a compose change
# can be starting Postgres, Redis and MinIO from cold ahead of it.
HEALTH_TRIES="${HEALTH_TRIES:-60}"
LOG="${LOG:-$STACK/auto-deploy.log}"
LOCK="${LOCK:-/tmp/retina-auto-deploy.lock}"

log() { echo "[$(date -Is)] $*" >> "$LOG"; }

# Never let two deploys run at once: a cron tick during a slow build would
# otherwise fight the first run over the same image tag. Skipped when this
# process already holds the lock, which is the case after the re-exec below.
# fd 9 survives exec, so the lock is still held, and taking it again through a
# second descriptor would deadlock this script against itself.
if [[ "${AUTO_DEPLOY_LOCK_HELD:-0}" != "1" ]]; then
  exec 9>"$LOCK" || exit 1
  flock -n 9 || exit 0
  export AUTO_DEPLOY_LOCK_HELD=1
fi

cd "$REPO" 2>/dev/null || { log "FATAL: repo $REPO missing"; exit 1; }

# A dirty tree means someone is working on the box. Refuse rather than discard
# their work: this script must never be the reason something is lost.
if [[ -n "$(git status --porcelain)" ]]; then
  log "SKIP: working tree at $REPO is dirty; not touching it"
  exit 1
fi

if ! git fetch --quiet origin main 2>>"$LOG"; then
  log "SKIP: git fetch failed (deploy key or network)"
  exit 1
fi

LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse origin/main)"

# A hand-over from the previous version of this script (see below) is the
# middle of a deploy, not a new tick: the pull already happened, so HEAD is
# origin/main and the quiet path would end the deploy here. It carries the
# commit it started from, so the diffs further down still see what changed.
if [[ -n "${AUTO_DEPLOY_FROM:-}" ]]; then
  LOCAL="$AUTO_DEPLOY_FROM"
  log "continuing the deploy of ${REMOTE:0:7} under the updated script"
else
  [[ "$LOCAL" == "$REMOTE" ]] && exit 0   # nothing new; the quiet common case
  log "new commit ${REMOTE:0:7} (was ${LOCAL:0:7}) — deploying"
fi

if ! git merge-base --is-ancestor "$LOCAL" "$REMOTE"; then
  log "ABORT: local history is not an ancestor of origin/main (diverged)"
  exit 1
fi

git pull --ff-only --quiet origin main 2>>"$LOG" || { log "ABORT: pull failed"; exit 1; }

# This script is a copy of the one in the clone, and the copy is what cron runs.
# Replace it by rename, never in place: bash reads a script as it executes it,
# so rewriting the running file feeds the shell whatever lands at its current
# offset. A rename gives the new content a new inode and leaves this process
# reading the old one. Then hand over, so a commit that changes both the script
# and compose.yaml is deployed by the logic that was written for it.
# The AUTO_DEPLOY_FROM guard makes the hand-over provably happen at most once
# per deploy, whatever the two files look like.
# lib/stack.sh counts as part of this script: it was sourced before the pull,
# so a commit that changed it is not in effect until the hand-over re-sources it.
if [[ -z "${AUTO_DEPLOY_FROM:-}" ]] &&
   { ! cmp -s "$REPO/deploy/auto-deploy.sh" "$STACK/auto-deploy.sh" ||
     [[ -n "$(git -C "$REPO" diff --name-only "$LOCAL" "$REMOTE" -- deploy/lib/)" ]]; }; then
  retina_install_if_changed "$REPO/deploy/auto-deploy.sh" "$STACK/auto-deploy.sh" 755
  # 0 installed, 1 already current. Either way the running shell still holds the
  # old script and the pre-pull library, so hand over; only a failed write does not.
  if [[ $? -le 1 ]]; then
    log "auto-deploy.sh or its library updated from the clone; handing over to it"
    export AUTO_DEPLOY_FROM="$LOCAL"
    exec "$STACK/auto-deploy.sh"
  fi
  log "  WARNING: could not update auto-deploy.sh; continuing with the old one"
fi

# Remember what is running, by image ID, so a bad deploy can be undone even
# though the new image reuses the same tag.
PREV_IMAGE="$(docker inspect --format '{{.Image}}' "${STACK##*/}-api-1" 2>/dev/null)"

# Give it a name before deploying. Once the new image takes the :main tag the
# old one is dangling, and the prune at the end of a SUCCESSFUL deploy would
# delete it, leaving the next deploy with nothing to roll back to. A tagged
# image is never dangling, so this keeps exactly one generation of fallback.
if [[ -n "$PREV_IMAGE" ]]; then
  docker tag "$PREV_IMAGE" "${IMAGE%:*}:previous" >/dev/null 2>&1 || true
fi

# The stack's compose file is a copy too. Keep the one it replaces: a service
# definition that cannot start has to be undone along with the image.
COMPOSE_CHANGED=0
retina_install_if_changed "$REPO/deploy/compose.yaml" "$STACK/compose.yaml" 644
case $? in
  0) COMPOSE_CHANGED=1; log "compose.yaml updated from the clone" ;;
  1) ;;
  *) log "  WARNING: could not update compose.yaml; deploying against the old one" ;;
esac

USE_REGISTRY="${USE_REGISTRY:-0}"

if [[ "$USE_REGISTRY" == "1" ]]; then
  # CI publishes the moving :main tag on every push, so by the time the commit
  # is visible here the image usually exists. Usually is not always: a pull
  # that 404s means CI is still building, and the next tick will get it.
  if ! docker pull "$IMAGE" >>"$LOG" 2>&1; then
    log "PULL FAILED at ${REMOTE:0:7} (CI still building, or not logged in to GHCR)"
    log "  the commit stays checked out; the next run retries"
    exit 1
  fi
elif ! docker build -t "$IMAGE" backend >>"$LOG" 2>&1; then
  log "BUILD FAILED at ${REMOTE:0:7} — running container left untouched"
  exit 1
fi

cd "$STACK" || { log "FATAL: stack dir $STACK missing"; exit 1; }

# The inbox server is built from emails/server in this checkout and mounts
# emails/data_v2. Data changes are live; server changes need a rebuild.
if [[ -n "$(git -C "$REPO" diff --name-only "$LOCAL" "$REMOTE" -- emails/server/)" ]]; then
  log "emails/server changed — rebuilding the inbox"
  docker compose up -d --build inbox >>"$LOG" 2>&1 || log "  inbox rebuild failed; the api deploy continues"
fi

# The llm-proxy is built from proxy/ in this checkout, config included, so any
# change there is a rebuild. A failed build leaves the old container serving.
if [[ -n "$(git -C "$REPO" diff --name-only "$LOCAL" "$REMOTE" -- proxy/)" ]]; then
  log "proxy/ changed — rebuilding the llm-proxy"
  docker compose up -d --build llm-proxy >>"$LOG" 2>&1 || log "  llm-proxy rebuild failed; the api deploy continues"
fi

# --no-deps normally, so a deploy never bounces Postgres under a running queue.
# But a compose change is how a new service first appears, and --no-deps would
# skip creating it: the api would then come up against a dependency that is not
# there. When the file changed, converge the whole stack.
if [[ "$COMPOSE_CHANGED" == "1" ]]; then
  log "compose.yaml changed — converging every service"
  docker compose up -d >>"$LOG" 2>&1
else
  docker compose up -d --no-deps $SERVICES >>"$LOG" 2>&1
fi

HEALTH_BODY=""
probe_health() {
  HEALTH_BODY="$(curl -fsS --max-time 5 "$HEALTH_URL" 2>/dev/null)" || return 1
  retina_health_ready "$HEALTH_BODY"
}

for _ in $(seq 1 "$HEALTH_TRIES"); do
  if probe_health; then
    log "DEPLOYED ${REMOTE:0:7} — healthy"
    for dep in minio inbox; do
      [[ "$HEALTH_BODY" == *"\"$dep\":\"down\""* ]] && log "  WARNING: $dep is down; deploy kept"
    done
    # Dangling images only. Never -a: that would delete images still tagged.
    docker image prune -f >/dev/null 2>&1
    exit 0
  fi
  sleep 2
done

log "HEALTH CHECK FAILED after deploy of ${REMOTE:0:7}"
log "  last /health: ${HEALTH_BODY:-<no answer>}"
if [[ "$COMPOSE_CHANGED" == "1" && -f "$STACK/compose.yaml.previous" ]]; then
  log "restoring the previous compose.yaml"
  cp -f "$STACK/compose.yaml.previous" "$STACK/compose.yaml"
fi
if [[ -n "$PREV_IMAGE" ]]; then
  log "rolling back to ${PREV_IMAGE:0:19}"
  docker tag "$PREV_IMAGE" "$IMAGE" >>"$LOG" 2>&1
  docker compose up -d --no-deps $SERVICES >>"$LOG" 2>&1
  log "rolled back — the bad commit is still checked out, fix and push again"
else
  log "no previous image recorded; cannot roll back automatically"
fi
exit 1

#!/usr/bin/env bash
#
# Pull-based continuous deployment for the Monash backend.
#
# GitHub runners cannot SSH into this box — the university firewall blocks
# inbound connections, which is why the API is reached through an outbound
# ngrok tunnel. So deployment cannot be pushed here; the box has to reach out
# and fetch. Cron runs this, it checks origin/main, and it redeploys only when
# the commit actually changed.
#
# Install:
#   cp auto-deploy.sh ~/retina/ && chmod +x ~/retina/auto-deploy.sh
#   crontab -e   ->   */3 * * * * /home/student/retina/auto-deploy.sh
#
# Two ways to get the image, chosen by USE_REGISTRY:
#   0 (default) build from the source we just pulled. Needs no registry
#     credentials, which is why it is the default — the deploy key is
#     read-only and that is all a source build requires.
#   1 pull the image CI already built and pushed. Better once the box is
#     logged in to GHCR (docker login ghcr.io), because CI has type-checked
#     and linted that image and this box has not.
#
# Safety properties, in order of how much they matter:
#   - a failed build never touches the running container
#   - a deploy that fails its health check is rolled back to the previous image,
#     which is kept tagged as :previous so pruning cannot remove it
#   - two runs cannot overlap (flock)
#   - a dirty or diverged clone aborts rather than being force-reset
#
# It never touches Postgres. Migrations are the API container's job, run on
# startup by the CMD in backend/Dockerfile.

set -uo pipefail

# cron gets a minimal PATH and would not otherwise find docker.
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

REPO="${REPO:-$HOME/projects/retina}"
STACK="${STACK:-$HOME/retina}"
IMAGE="${IMAGE:-ghcr.io/noobmaster169/retina-api:main}"
SERVICE="${SERVICE:-api}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:8091/health}"
LOG="${LOG:-$STACK/auto-deploy.log}"
LOCK="${LOCK:-/tmp/retina-auto-deploy.lock}"

log() { echo "[$(date -Is)] $*" >> "$LOG"; }

# Never let two deploys run at once — a cron tick during a slow build would
# otherwise fight the first run over the same image tag.
exec 9>"$LOCK" || exit 1
flock -n 9 || exit 0

cd "$REPO" 2>/dev/null || { log "FATAL: repo $REPO missing"; exit 1; }

# A dirty tree means someone is working on the box. Refuse rather than discard
# their work — this script must never be the reason something is lost.
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
[[ "$LOCAL" == "$REMOTE" ]] && exit 0   # nothing new; the quiet common case

log "new commit ${REMOTE:0:7} (was ${LOCAL:0:7}) — deploying"

if ! git merge-base --is-ancestor "$LOCAL" "$REMOTE"; then
  log "ABORT: local history is not an ancestor of origin/main (diverged)"
  exit 1
fi

git pull --ff-only --quiet origin main 2>>"$LOG" || { log "ABORT: pull failed"; exit 1; }

# Remember what is running, by image ID, so a bad deploy can be undone even
# though the new image reuses the same tag.
PREV_IMAGE="$(docker inspect --format '{{.Image}}' "${STACK##*/}-${SERVICE}-1" 2>/dev/null)"

# Give it a name before deploying. Once the new image takes the :main tag the
# old one is dangling, and the prune at the end of a SUCCESSFUL deploy would
# delete it — leaving the next deploy with nothing to roll back to. A tagged
# image is never dangling, so this keeps exactly one generation of fallback.
if [[ -n "$PREV_IMAGE" ]]; then
  docker tag "$PREV_IMAGE" "${IMAGE%:*}:previous" >/dev/null 2>&1 || true
fi

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
docker compose up -d --no-deps "$SERVICE" >>"$LOG" 2>&1

# The container runs migrations before it listens, so give it real time.
for _ in $(seq 1 45); do
  if curl -fsS --max-time 5 "$HEALTH_URL" 2>/dev/null | grep -q '"status":"ok"'; then
    log "DEPLOYED ${REMOTE:0:7} — healthy"
    # Dangling images only. Never -a: that would delete images still tagged.
    docker image prune -f >/dev/null 2>&1
    exit 0
  fi
  sleep 2
done

log "HEALTH CHECK FAILED after deploy of ${REMOTE:0:7}"
if [[ -n "$PREV_IMAGE" ]]; then
  log "rolling back to ${PREV_IMAGE:0:19}"
  docker tag "$PREV_IMAGE" "$IMAGE" >>"$LOG" 2>&1
  docker compose up -d --no-deps "$SERVICE" >>"$LOG" 2>&1
  log "rolled back — the bad commit is still checked out, fix and push again"
else
  log "no previous image recorded; cannot roll back automatically"
fi
exit 1

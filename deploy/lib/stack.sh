# Shared by bootstrap-wizard.sh and auto-deploy.sh. Sourced, never executed.
#
# These three things were written out by hand in both scripts. The health gate
# is the one that matters: it decides whether a deploy rolls back, and two
# hand-typed copies of a substring match against JSON is how a rollback quietly
# stops firing.
#
# A sourced file is safe to read from the clone even though auto-deploy.sh is
# not: bash reads a running script incrementally, so a pull can feed it new
# bytes at an old offset, while `.` reads a file whole before anything runs.
# auto-deploy.sh's hand-over covers a change to this file for the same reason
# it covers a change to itself.

# Where the box keeps things. Every value stays overridable, which is how
# deploy/sim points them somewhere else.
retina_stack_defaults() {
  REPO="${REPO:-$HOME/projects/retina}"
  STACK="${STACK:-$HOME/retina}"
  IMAGE="${IMAGE:-ghcr.io/noobmaster169/retina-api:main}"
  HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:8091/health}"
}

# The report is degraded whenever ANY dependency is down, so "status":"ok" is
# the wrong gate: it would roll back working code because MinIO is restarting.
# Gate on the two the api cannot serve a run without, and warn about the rest.
retina_health_ready() {
  [[ "$1" == *'"postgres":"up"'* && "$1" == *'"redis":"up"'* ]]
}

# Copy into place only when it differs, keeping the replaced file as .previous.
# By rename, never in place: cron may be executing the old copy right now, and
# a partial write is a file bash reads halfway through.
# Prints nothing; the caller owns its own logging.
retina_install_if_changed() {
  local src="$1" dst="$2" mode="$3"
  [[ -f "$src" ]] || return 2
  cmp -s "$src" "$dst" 2>/dev/null && return 1
  [[ -f "$dst" ]] && cp -f "$dst" "$dst.previous"
  mkdir -p "$(dirname "$dst")"
  install -m "$mode" "$src" "$dst.new" && mv -f "$dst.new" "$dst"
}

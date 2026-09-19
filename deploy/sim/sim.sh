#!/usr/bin/env bash
#
# The box simulator. Runs deploy/auto-deploy.sh and deploy/bootstrap-wizard.sh
# against a replica of the Monash layout, on this machine, so a deploy script
# is proven before cron on the box runs it. We cannot SSH into that box, so a
# wrong script there costs a manual recovery; here it costs a re-run.
#
#   ./sim.sh up          build the simulator and seed its origin
#   ./sim.sh test        the whole suite: bootstrap, deploy, rollback, refusals
#   ./sim.sh shell       a shell inside, laid out like the box
#   ./sim.sh down        stop it (keeps the image cache; `purge` drops that too)
#
# Inside it: /srv/origin.git stands in for GitHub, ~/projects/retina is the
# clone, ~/retina is the stack. `sync` copies this repo's branches into the
# simulated origin, `release <ref>` moves its main, which is the only way a
# deploy is ever triggered.
#
# What it proves: the script's own logic, and that deploy/compose.yaml comes up
# on a machine that has never seen it. What it cannot prove: the host llm-proxy
# on 172.17.0.1:4001, the claude CLI, ngrok, cron, the box's real .env, and its
# disk and memory headroom. Those still need the box.

set -uo pipefail

# Git Bash rewrites arguments that look like absolute paths into Windows paths
# before docker ever sees them, which turns /srv/origin.git into C:/Program...
export MSYS_NO_PATHCONV=1
export MSYS2_ARG_CONV_EXCL="*"

SIM="${SIM:-retina-sim}"
SIM_IMAGE="${SIM_IMAGE:-retina-sim:latest}"
SIM_VOLUME="${SIM_VOLUME:-retina-sim-docker}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"

say() { echo "[sim] $*"; }
die() { echo "[sim] FATAL: $*" >&2; exit 1; }

# Docker on Windows wants C:/... for a bind mount or a build context, and the
# conversion that would normally do this is off (see MSYS_NO_PATHCONV above):
# it would also rewrite the container-side paths, which must stay literal.
hostpath() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf '%s' "$1"; fi; }

# Everything inside runs as the box's layout: root, but rooted at /home/student.
sx() { docker exec -e HOME=/home/student -w /home/student "$SIM" bash -lc "$1"; }
sx_i() { docker exec -it -e HOME=/home/student -w /home/student "$SIM" bash -l; }

running() { [[ "$(docker inspect -f '{{.State.Running}}' "$SIM" 2>/dev/null)" == "true" ]]; }

cmd_up() {
  if running; then say "already up"; return 0; fi
  say "building the simulator image"
  docker build -t "$SIM_IMAGE" "$(hostpath "$HERE")" || die "image build failed"

  docker rm -f "$SIM" >/dev/null 2>&1
  say "starting $SIM (privileged: it runs a Docker daemon of its own)"
  # The repo is mounted read-only and only ever read through git, so the
  # simulator cannot touch the working tree it was seeded from.
  docker run -d --privileged --name "$SIM" \
    -e DOCKER_TLS_CERTDIR= \
    -v "$SIM_VOLUME:/var/lib/docker" \
    -v "$(hostpath "$REPO_ROOT"):/host-repo:ro" \
    "$SIM_IMAGE" >/dev/null || die "could not start the simulator"

  say "waiting for its docker daemon"
  for _ in $(seq 1 60); do
    sx 'docker info' >/dev/null 2>&1 && break
    sleep 2
  done
  sx 'docker info' >/dev/null 2>&1 || die "docker daemon inside the simulator never came up"

  cmd_sync
  say "up. next: ./sim.sh test"
}

# The simulated GitHub. Branches are copied from this repo, so a local commit
# is enough to exercise a deploy; nothing is pushed anywhere real.
cmd_sync() {
  running || die "not up"
  sx 'test -d /srv/origin.git' >/dev/null 2>&1 || {
    say "seeding /srv/origin.git from this repo"
    sx 'git clone --bare --quiet /host-repo /srv/origin.git' || die "could not seed origin"
  }
  sx 'git --git-dir=/srv/origin.git fetch --quiet --force /host-repo "+refs/heads/*:refs/heads/*"' \
    || die "could not sync branches into the simulated origin"
  sx 'git --git-dir=/srv/origin.git config user.email sim@retina.local
      git --git-dir=/srv/origin.git config user.name "retina sim"'
}

# Move the simulated origin/main. This is what a merge to main looks like here.
cmd_release() {
  local ref="${1:?usage: sim.sh release <ref>}"
  running || die "not up"
  sx "git --git-dir=/srv/origin.git update-ref refs/heads/main \"\$(git --git-dir=/srv/origin.git rev-parse $ref)\"" \
    || die "no such ref in the simulated origin: $ref"
  say "origin/main is now $(sx "git --git-dir=/srv/origin.git rev-parse --short main" | tr -d '\r')"
}

# A fresh box: clone, then let the wizard do every step a human would.
cmd_bootstrap() {
  local ref="${1:-phase-03-vps-deploy}"
  running || die "not up"
  cmd_sync
  cmd_release "$ref"
  say "cloning, as the box's deploy key would"
  sx 'rm -rf /home/student/projects/retina
      git clone --quiet --branch main /srv/origin.git /home/student/projects/retina
      git -C /home/student/projects/retina config user.email sim@retina.local
      git -C /home/student/projects/retina config user.name "retina sim"' || die "clone failed"
  say "running bootstrap-wizard.sh --non-interactive (this builds images; first run is slow)"
  sx 'bash /home/student/projects/retina/deploy/bootstrap-wizard.sh --non-interactive'
}

cmd_deploy() {
  running || die "not up"
  sx '/home/student/retina/auto-deploy.sh'
  local code=$?
  say "auto-deploy.sh exited $code"
  return $code
}

cmd_logs() { sx 'tail -n 40 /home/student/retina/auto-deploy.log 2>/dev/null || echo "(no log yet)"'; }
cmd_health() { sx 'curl -fsS --max-time 5 http://127.0.0.1:8091/health || echo "(no answer)"'; }
cmd_ps() { sx 'cd /home/student/retina && docker compose ps'; }
cmd_shell() { running || die "not up"; sx_i; }
cmd_down() { docker rm -f "$SIM" >/dev/null 2>&1; say "stopped (image cache kept in volume $SIM_VOLUME)"; }
cmd_purge() { cmd_down; docker volume rm "$SIM_VOLUME" >/dev/null 2>&1; say "image cache dropped"; }

# --- the suite ---------------------------------------------------------------

PASS=0
FAIL=0
check() {
  local what="$1"; shift
  if "$@"; then echo "  PASS  $what"; PASS=$((PASS + 1));
  else echo "  FAIL  $what"; FAIL=$((FAIL + 1)); fi
}
log_has() { sx "grep -q -- '$1' /home/student/retina/auto-deploy.log"; }
log_lines() { sx "wc -l < /home/student/retina/auto-deploy.log" | tr -cd '0-9'; }
health_has() { sx "curl -fsS --max-time 5 http://127.0.0.1:8091/health | grep -q -- '$1'"; }
mark() { sx "echo '--- $1 ---' >> /home/student/retina/auto-deploy.log"; }
env_of() { sx "cd /home/student/retina && docker compose exec -T $1 printenv $2" | tr -d '\r\n'; }

# Nothing may reach the box from outside except the api, on loopback. Any other
# host-side mapping is a finding, so this asks about mappings, not about names.
only_api_published() {
  ! sx "cd /home/student/retina && docker compose ps --format '{{.Ports}}' \
        | tr ', ' '\n' | grep -- '->' | grep -qv '^127.0.0.1:8091->'"
}

# A commit the box has never seen. `kind` decides what it breaks.
simulate_commit() {
  local kind="$1" message="$2"
  sx "set -e
      rm -rf /srv/work && git clone --quiet --branch main /srv/origin.git /srv/work
      cd /srv/work
      git config user.email sim@retina.local && git config user.name 'retina sim'
      case '$kind' in
        trivial)
          printf '\n# deployed by the simulator\n' >> deploy/README.md ;;
        compose-and-script)
          sed -i 's|^  EMAIL_SERVER_URL: http://inbox:8000|  EMAIL_SERVER_URL: http://inbox:8000\n  LOG_LEVEL: debug|' deploy/compose.yaml
          grep -q 'LOG_LEVEL: debug' deploy/compose.yaml
          printf '\n# touched by the simulator\n' >> deploy/auto-deploy.sh ;;
        broken-health)
          sed -i 's|check(\"postgres\", () => deps.pool.query(\"select 1\"))|check(\"postgres\", () => Promise.reject(new Error(\"simulated outage\")))|' backend/src/health.ts
          grep -q 'simulated outage' backend/src/health.ts ;;
      esac
      git commit --quiet -am '$message'
      git push --quiet origin main"
}

cmd_test() {
  running || die "not up; run ./sim.sh up first"
  local started_at
  started_at="$(date +%s)"

  say "A. bootstrap: a box that has never seen this compose file"
  cmd_bootstrap "${1:-phase-03-vps-deploy}" || die "bootstrap failed; ./sim.sh shell to look"
  check "every dependency reports up" health_has '"status":"ok"'
  check "the worker is running" sx "cd /home/student/retina && docker compose ps worker --status running | grep -q worker"
  check "nothing but the api is published, on loopback" only_api_published

  say "B. a tick with nothing new"
  mark "B no-op"
  local before after
  before="$(log_lines)"
  cmd_deploy
  after="$(log_lines)"
  check "wrote nothing to the log" test "$before" = "$after"

  say "C. a new commit on main"
  mark "C new commit"
  simulate_commit trivial "docs: a line the simulator added" || die "could not make the commit"
  cmd_deploy
  check "deployed and healthy" log_has "DEPLOYED"
  check "still serving" health_has '"postgres":"up"'

  say "D. a commit that changes compose.yaml and auto-deploy.sh together"
  mark "D self-sync"
  simulate_commit compose-and-script "chore: the simulator changes both stack files" || die "could not make the commit"
  cmd_deploy
  check "the script updated itself and handed over" log_has "handing over to it"
  check "compose.yaml came from the clone" log_has "compose.yaml updated from the clone"
  check "the stack converged" log_has "converging every service"
  check "the box runs the new script" sx "cmp -s /home/student/retina/auto-deploy.sh /home/student/projects/retina/deploy/auto-deploy.sh"
  # The point of the sync: a value that only exists in the committed compose
  # file is live in the running container.
  check "the new compose value reached the api" test "$(env_of api LOG_LEVEL)" = "debug"

  say "E. a commit whose /health says Postgres is down"
  mark "E rollback"
  simulate_commit broken-health "fix: a break the simulator introduced" || die "could not make the commit"
  cmd_deploy && { echo "  FAIL  a broken deploy must exit non-zero"; FAIL=$((FAIL + 1)); }
  check "the health gate refused it" log_has "HEALTH CHECK FAILED"
  check "rolled back to the previous image" log_has "rolling back to"
  check "the API still serves the old code" health_has '"postgres":"up"'

  say "F. a dirty clone"
  mark "F dirty"
  sx 'echo scratch >> /home/student/projects/retina/deploy/README.md'
  cmd_deploy
  check "refused to touch it" log_has "working tree at .* is dirty"
  sx 'git -C /home/student/projects/retina checkout -- deploy/README.md'

  echo
  say "$PASS passed, $FAIL failed, $(($(date +%s) - started_at))s"
  [[ "$FAIL" == "0" ]]
}

case "${1:-}" in
  up) cmd_up ;;
  sync) cmd_sync ;;
  release) shift; cmd_release "$@" ;;
  bootstrap) shift; cmd_bootstrap "$@" ;;
  deploy) cmd_deploy ;;
  test) shift; cmd_test "$@" ;;
  logs) cmd_logs ;;
  health) cmd_health; echo ;;
  ps) cmd_ps ;;
  shell) cmd_shell ;;
  down) cmd_down ;;
  purge) cmd_purge ;;
  *) sed -n '3,24p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' ;;
esac

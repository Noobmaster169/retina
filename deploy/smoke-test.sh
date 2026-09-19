#!/usr/bin/env bash
#
# What the pipeline needs to know about this box: is the llm-proxy up and logged
# in, which aliases does it serve, does structured output really work, and is
# there headroom left.
#
#   ./smoke-test.sh                        read-only checks, no model calls
#   ./smoke-test.sh --schema               also prove structured output
#   ./smoke-test.sh --schema --parallel    also see how 8 at once behave
#
# The proxy is a service of the compose stack with no published port, so every
# request is made from inside its container (`docker compose exec llm-proxy
# curl`). Pass a URL instead to test a proxy this shell can reach directly.
#
# Read-only: it changes nothing and can be run any time. That is the point of it
# being its own script. bootstrap-wizard.sh calls it for stage 6, and the runbook
# sends you here after the token or the pinned CLI version changes.
#
# Prints the report as a block to paste into docs/PROGRESS.md under "Verified on
# the box". Exits non-zero when something needs attention.

set -uo pipefail

# shellcheck source=lib/stack.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/stack.sh"
retina_stack_defaults

PROXY_URL=""
WANT_SCHEMA=0
WANT_PARALLEL=0
for arg in "$@"; do
  case "$arg" in
    --schema) WANT_SCHEMA=1 ;;
    --parallel) WANT_PARALLEL=1 ;;
    http*) PROXY_URL="$arg" ;;
    *) echo "usage: smoke-test.sh [PROXY_URL] [--schema] [--parallel]" >&2; exit 2 ;;
  esac
done

# One request to the proxy: curl on this shell for an explicit URL, else curl
# inside the llm-proxy container against its own port. -f is the caller's: a
# failed model call has to show its body, which says why.
px() {
  local path="$1"; shift
  if [[ -n "$PROXY_URL" ]]; then
    curl -sS "$@" "$PROXY_URL$path"
  else
    docker compose -f "$STACK/compose.yaml" exec -T llm-proxy curl -sS "$@" "http://127.0.0.1:4000$path"
  fi
}
WHERE="${PROXY_URL:-the llm-proxy container}"

REPORT=()
PROBLEMS=0
record() { REPORT+=("$1"); }
problem() { PROBLEMS=$((PROBLEMS + 1)); echo "  ! $1" >&2; }

if px /healthz -f --max-time 5 >/dev/null 2>&1; then
  record "proxy ($WHERE): up"
  ALIASES="$(px /v1/models -f --max-time 10 2>/dev/null | tr ',' '\n' | grep -o '"id":"[^"]*"' | cut -d'"' -f4 | tr '\n' ' ' || true)"
  record "aliases: ${ALIASES:-<none returned>}"
  if [[ -z "$PROXY_URL" ]]; then
    record "claude CLI in the image: $(docker compose -f "$STACK/compose.yaml" exec -T llm-proxy claude --version 2>/dev/null | head -n1 || echo '?')"
  fi

  if [[ "$WANT_SCHEMA" == "1" ]]; then
    SCHEMA_ANSWER="$(px /v1/messages --max-time 120 \
      -H 'content-type: application/json' -H 'x-api-key: retina-bootstrap' \
      -d '{"model":"haiku","max_tokens":64,"messages":[{"role":"user","content":"Name one colour."}],"output_config":{"format":{"type":"json_schema","schema":{"type":"object","properties":{"colour":{"type":"string"}},"required":["colour"],"additionalProperties":false}}}}' \
      2>&1 || true)"
    if [[ "$SCHEMA_ANSWER" == *'"colour"'* ]]; then
      record "structured output: the provider constrained the answer (so claude is logged in)"
    elif [[ "$SCHEMA_ANSWER" == *provider_not_logged_in* ]]; then
      record "structured output: FAILED. ${SCHEMA_ANSWER:0:200}"
      problem "claude in the container is not logged in: set CLAUDE_CODE_OAUTH_TOKEN in $STACK/.env, then docker compose up -d llm-proxy"
    else
      record "structured output: FAILED. ${SCHEMA_ANSWER:0:200}"
      problem "structured output does not work: check the CLI version above (needs 2.1.274+) and docker compose logs llm-proxy"
    fi
  fi

  if [[ "$WANT_PARALLEL" == "1" ]]; then
    TALLY="$(mktemp "${TMPDIR:-/tmp}/retina-parallel.XXXXXX")"
    for _ in $(seq 1 8); do
      ( px /v1/messages -f --max-time 300 -H 'content-type: application/json' \
        -H 'x-api-key: retina-bootstrap' \
        -d '{"model":"haiku","max_tokens":8,"messages":[{"role":"user","content":"hi"}]}' \
        >/dev/null 2>&1 && echo ok ) >> "$TALLY" &
    done
    wait
    record "8 parallel calls: $(grep -c ok "$TALLY" 2>/dev/null || echo 0) succeeded"
    rm -f "$TALLY"
  fi
else
  record "proxy ($WHERE): DOWN"
  problem "no proxy answering: docker compose -f $STACK/compose.yaml ps llm-proxy, then its logs"
fi

record "disk free on $HOME: $(df -Ph "$HOME" 2>/dev/null | awk 'NR==2 {print $4}' || echo '?')"
# This box also carries another project's stack.
record "memory available: $(free -h 2>/dev/null | awk 'NR==2 {print $7 " of " $2}' || echo '?')"

printf '\n  paste this into docs/PROGRESS.md:\n\n'
for line in "${REPORT[@]}"; do printf '  - %s\n' "$line"; done
printf '\n'

[[ "$PROBLEMS" == "0" ]]

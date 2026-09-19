#!/usr/bin/env bash
#
# What phase 4 needs to know about this box: is the proxy up, which aliases does
# it serve, does structured output really work, and is there headroom left.
#
#   ./smoke-test.sh                        read-only checks, no model calls
#   ./smoke-test.sh --schema               also prove structured output
#   ./smoke-test.sh --schema --parallel    also see how 8 at once behave
#
# Read-only: it changes nothing and can be run any time. That is the point of it
# being its own script. bootstrap-wizard.sh calls it for stage 6, and the runbook
# sends you here after a `claude` upgrade, which used to mean either re-running
# the whole six-stage wizard or pasting a curl out of the README by hand.
#
# Prints the report as a block to paste into docs/PROGRESS.md under "Verified on
# the box". Exits non-zero when something needs attention.

set -uo pipefail

PROXY_URL="${PROXY_URL:-http://172.17.0.1:4001}"
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

REPORT=()
PROBLEMS=0
record() { REPORT+=("$1"); }
problem() { PROBLEMS=$((PROBLEMS + 1)); echo "  ! $1" >&2; }

if curl -fsS --max-time 5 "$PROXY_URL/healthz" >/dev/null 2>&1; then
  record "proxy at $PROXY_URL: up"
  ALIASES="$(curl -fsS --max-time 10 "$PROXY_URL/v1/models" 2>/dev/null | tr ',' '\n' | grep -o '"id":"[^"]*"' | cut -d'"' -f4 | tr '\n' ' ' || true)"
  record "aliases: ${ALIASES:-<none returned>}"

  if [[ "$WANT_SCHEMA" == "1" ]]; then
    SCHEMA_ANSWER="$(curl -fsS --max-time 120 "$PROXY_URL/v1/messages" \
      -H 'content-type: application/json' -H 'x-api-key: retina-bootstrap' \
      -d '{"model":"haiku","max_tokens":64,"messages":[{"role":"user","content":"Name one colour."}],"output_config":{"format":{"type":"json_schema","schema":{"type":"object","properties":{"colour":{"type":"string"}},"required":["colour"],"additionalProperties":false}}}}' \
      2>/dev/null || true)"
    if [[ "$SCHEMA_ANSWER" == *'"colour"'* ]]; then
      record "structured output: the provider constrained the answer"
    else
      record "structured output: FAILED. ${SCHEMA_ANSWER:0:200}"
      problem "structured output does not work: check claude --version (needs 2.1.274+) and the proxy log"
    fi
  fi

  if [[ "$WANT_PARALLEL" == "1" ]]; then
    TALLY="$(mktemp "${TMPDIR:-/tmp}/retina-parallel.XXXXXX")"
    for _ in $(seq 1 8); do
      ( curl -fsS --max-time 120 "$PROXY_URL/v1/messages" -H 'content-type: application/json' \
        -H 'x-api-key: retina-bootstrap' \
        -d '{"model":"qwen3:4b","max_tokens":8,"messages":[{"role":"user","content":"hi"}]}' \
        >/dev/null 2>&1 && echo ok ) >> "$TALLY" &
    done
    wait
    record "8 parallel calls: $(grep -c ok "$TALLY" 2>/dev/null || echo 0) succeeded"
    rm -f "$TALLY"
  fi
else
  record "proxy at $PROXY_URL: DOWN"
  problem "no proxy at $PROXY_URL"
fi

record "disk free on $HOME: $(df -Ph "$HOME" 2>/dev/null | awk 'NR==2 {print $4}' || echo '?')"
# This box also carries another project's stack, and phase 3 adds Redis, MinIO
# and a second node process to it.
record "memory available: $(free -h 2>/dev/null | awk 'NR==2 {print $7 " of " $2}' || echo '?')"

printf '\n  paste this into docs/PROGRESS.md:\n\n'
for line in "${REPORT[@]}"; do printf '  - %s\n' "$line"; done
printf '\n'

[[ "$PROBLEMS" == "0" ]]

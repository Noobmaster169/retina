#!/usr/bin/env bash
# Runs retina's llm-proxy (the one in this repo, proxy/) on the Monash host, so
# the API container can reach it. Separate from yt-engine's proxy on 4000.
#
# It binds the Docker bridge address (172.17.0.1), which containers see as
# host.docker.internal and nothing outside the box can reach. It runs on the
# host rather than in a container because the claudecli rail shells out to
# `claude`, which lives under nvm's node bin with the student user's login.
#
# Install (once the repo is cloned at ~/projects/retina):
#   cd ~/projects/retina/proxy && ~/miniforge3/bin/python3 -m venv .venv && .venv/bin/pip install -e .
#   cp ~/projects/retina/deploy/run-proxy.sh ~/retina/ && chmod +x ~/retina/run-proxy.sh
#   setsid nohup ~/retina/run-proxy.sh >/dev/null 2>&1 </dev/null &
#   crontab -e  ->  @reboot setsid nohup /home/student/retina/run-proxy.sh >/dev/null 2>&1 </dev/null &
#
# Restart after a config or code change: kill the uvicorn process and the loop
# brings it back in 5 s —  pkill -f "^\.venv/bin/python -m uvicorn llm_proxy.*--port 4001"
set -u
REPO="${REPO:-$HOME/projects/retina}"
HOST="${LLM_PROXY_HOST:-172.17.0.1}"
PORT="${LLM_PROXY_PORT:-4001}"
LOG="${LOG:-$HOME/retina/llm-proxy.log}"

# `claude` is on the interactive PATH (nvm, ~/.local/bin), not cron's or nohup's.
for node_bin in "$HOME"/.nvm/versions/node/*/bin; do PATH="$node_bin:$PATH"; done
export PATH="$HOME/.local/bin:$PATH"

cd "$REPO/proxy" || exit 1
while true; do
  echo "[$(date -Is)] starting llm-proxy on $HOST:$PORT" >> "$LOG"
  LLM_PROXY_HOST="$HOST" LLM_PROXY_PORT="$PORT" ./start.sh >> "$LOG" 2>&1
  echo "[$(date -Is)] llm-proxy exited ($?); restarting in 5s" >> "$LOG"
  sleep 5
done

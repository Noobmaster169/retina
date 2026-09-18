#!/usr/bin/env bash
# Keeps the retina tunnel up. The university firewall blocks inbound
# connections to this box, so the API is published through an OUTBOUND ngrok
# tunnel on 443 to a static domain; the frontend's BACKEND_URL points at it.
#
# This is a SECOND tunnel next to yt-engine's. ngrok's free plan gives one
# static domain per account, so this one runs from a second account's
# authtoken in its own config file:
#   ngrok config add-authtoken <token> --config ~/retina/ngrok.yml
#
# Install:
#   cp run-ngrok.sh ~/retina/ && chmod +x ~/retina/run-ngrok.sh
#   edit NGROK_DOMAIN below (the same value goes in the Vercel env as BACKEND_URL)
#   setsid nohup ~/retina/run-ngrok.sh >/dev/null 2>&1 </dev/null &
#   crontab -e  ->  @reboot setsid nohup /home/student/retina/run-ngrok.sh >/dev/null 2>&1 </dev/null &
set -u
NGROK_DOMAIN="${NGROK_DOMAIN:-RETINA_NGROK_DOMAIN.ngrok-free.dev}"
PORT="${PORT:-8091}"
CONFIG="${CONFIG:-$HOME/retina/ngrok.yml}"
LOG="${LOG:-$HOME/retina/ngrok.log}"

while true; do
  echo "[$(date -Is)] starting ngrok → $NGROK_DOMAIN → 127.0.0.1:$PORT" >> "$LOG"
  /snap/bin/ngrok http --config "$CONFIG" --domain="$NGROK_DOMAIN" "$PORT" --log=stdout >> "$LOG" 2>&1
  echo "[$(date -Is)] ngrok exited ($?); restarting in 5s" >> "$LOG"
  sleep 5
done

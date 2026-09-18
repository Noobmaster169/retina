#!/usr/bin/env bash
# Keeps the retina tunnel up. The university firewall blocks inbound
# connections to this box, so the API is published through an OUTBOUND ngrok
# tunnel on 443 to a static domain; the frontend's BACKEND_URL points at it.
#
# Install:
#   cp run-ngrok.sh ~/retina/ && chmod +x ~/retina/run-ngrok.sh
#   edit NGROK_DOMAIN below (the same value goes in the Vercel env as BACKEND_URL)
#   setsid nohup ~/retina/run-ngrok.sh >/dev/null 2>&1 </dev/null &
#   crontab -e  ->  @reboot /home/student/retina/run-ngrok.sh
#
# ngrok is the snap package; its authtoken lives in the student account's snap
# config (`ngrok config add-authtoken …`, once). This is a SECOND tunnel next
# to yt-engine's, so it needs a second static domain — one per free account.
set -u
NGROK_DOMAIN="${NGROK_DOMAIN:-RETINA_NGROK_DOMAIN.ngrok-free.dev}"
PORT="${PORT:-8091}"
LOG="${LOG:-$HOME/retina/ngrok.log}"

while true; do
  echo "[$(date -Is)] starting ngrok → $NGROK_DOMAIN → 127.0.0.1:$PORT" >> "$LOG"
  ngrok http --domain="$NGROK_DOMAIN" "$PORT" --log=stdout >> "$LOG" 2>&1
  echo "[$(date -Is)] ngrok exited ($?); restarting in 5s" >> "$LOG"
  sleep 5
done

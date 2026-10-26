#!/bin/bash
# What "Sanctuary Light.app" runs: make sure the service is up, then open the interface.
# Never starts lighting output — the server always starts in Offline Simulation.
PORT="${PORT:-4700}"
URL="http://localhost:$PORT"
LABEL="org.ltumc.sanctuary-light"

healthy() { curl -fsS --max-time 2 "$URL/api/health" 2>/dev/null | grep -q '"app":"sanctuary-light"'; }

if ! healthy; then
  launchctl kickstart "gui/$(id -u)/$LABEL" 2>/dev/null
  for _ in $(seq 1 30); do healthy && break; sleep 1; done
fi

if ! healthy; then
  osascript -e 'display alert "Sanctuary Light did not start" message "The ETC Ion still works normally. Ask the lighting lead, or check ~/Library/Logs/Sanctuary Light/server.log." as critical'
  exit 1
fi

# Prefer a full-screen Chrome app window if Chrome is installed; otherwise the default browser.
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
if [[ -x "$CHROME" && "${SANCTUARY_KIOSK:-0}" == "1" ]]; then
  "$CHROME" --app="$URL" --start-fullscreen >/dev/null 2>&1 &
else
  open "$URL"
fi

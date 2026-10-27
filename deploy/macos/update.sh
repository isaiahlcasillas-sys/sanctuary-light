#!/bin/bash
# Update Sanctuary Light on the sanctuary Mac. Never run during a service.
#   ./deploy/macos/update.sh
# Refuses unless the app is in Offline Simulation. Backs up the configuration first and
# rolls the code back if installing, building or testing fails.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
LABEL="org.ltumc.sanctuary-light"
DATA="$HOME/Library/Application Support/Sanctuary Light"
cd "$REPO"

PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
# Use the port the service was installed with (install.sh --port), not an assumption.
PORT="$(/usr/libexec/PlistBuddy -c 'Print :EnvironmentVariables:PORT' "$PLIST" 2>/dev/null || echo 4700)"
health="$(curl -fsS --max-time 3 "http://127.0.0.1:$PORT/api/health" 2>/dev/null || true)"
if [[ -z "$health" ]] && launchctl print "gui/$(id -u)/$LABEL" 2>/dev/null | grep -q "state = running"; then
  echo "The service is running but not answering on port $PORT, so its mode can't be confirmed. Not updating." >&2
  exit 1
fi
if [[ -n "$health" && "$health" != *'"mode":"offline"'* ]]; then
  echo "Sanctuary Light is connected to the Ion (Monitor or Live). Switch to SIM first, outside a service." >&2
  exit 1
fi

if [[ -f "$DATA/config.json" ]]; then
  mkdir -p "$DATA/backups"
  cp "$DATA/config.json" "$DATA/backups/pre-update-$(date +%Y%m%d-%H%M%S).json"
  echo "Configuration backed up."
fi

PREV="$(git rev-parse HEAD)"
echo "Current version: $(git log -1 --format='%h %s')"
git pull --ff-only
if [[ "$(git rev-parse HEAD)" == "$PREV" ]]; then echo "Already up to date."; exit 0; fi

rollback() {
  echo "Update failed — returning to the previous version ($PREV)." >&2
  # reset (not checkout) keeps the branch, so the next update can still `git pull`.
  git reset -q --hard "$PREV"
  npm ci && npm run build
  echo "Rolled back. The app was not restarted, so it keeps running the old version." >&2
  exit 1
}
npm ci || rollback
npm run build || rollback
npm test || rollback

launchctl kickstart -k "gui/$(id -u)/$LABEL"
echo "Updated to $(git log -1 --format='%h %s'). The app restarted in Offline Simulation."

#!/bin/bash
# Restore a Sanctuary Light configuration file when the app's own Settings → Backup →
# Restore can't be used. Nothing is sent to the Ion; the app restarts in Offline Simulation.
#   ./deploy/macos/restore-backup.sh ~/Library/Application\ Support/Sanctuary\ Light/backups/daily-2026-11-01.json
set -euo pipefail
LABEL="org.ltumc.sanctuary-light"
DATA="$HOME/Library/Application Support/Sanctuary Light"
SRC="${1:-}"
if [[ -z "$SRC" || ! -f "$SRC" ]]; then
  echo "Usage: $0 <backup.json>"; echo "Available backups:"; ls -1t "$DATA/backups" 2>/dev/null | head -20; exit 1
fi
# Accept either a raw config.json copy or a "Download backup" file ({ config: ... }).
node -e '
  const fs = require("fs"); const j = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const c = j.config ?? j;
  if (!c.settings || !Array.isArray(c.fixtures)) { console.error("Not a Sanctuary Light configuration."); process.exit(1); }
  fs.writeFileSync(process.argv[2], JSON.stringify(c, null, 2));
' "$SRC" "$DATA/restore.tmp"
read -r -p "Replace the current configuration with $(basename "$SRC")? [y/N] " answer
[[ "$answer" == "y" || "$answer" == "Y" ]] || { rm -f "$DATA/restore.tmp"; echo "Cancelled."; exit 0; }
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
[[ -f "$DATA/config.json" ]] && cp "$DATA/config.json" "$DATA/backups/pre-restore-$(date +%Y%m%d-%H%M%S).json"
mv "$DATA/restore.tmp" "$DATA/config.json"
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/$LABEL.plist"
echo "Restored. The app restarted in Offline Simulation; older formats are upgraded automatically."

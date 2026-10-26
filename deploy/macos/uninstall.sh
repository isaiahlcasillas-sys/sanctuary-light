#!/bin/bash
# Stop and remove the Sanctuary Light background service. Configuration and backups in
# ~/Library/Application Support/Sanctuary Light are kept. Nothing is sent to the Ion.
set -euo pipefail
LABEL="org.ltumc.sanctuary-light"
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/$LABEL.plist"
rm -rf "$HOME/Applications/Sanctuary Light.app"
echo "Removed the service and app launcher. Your data is still in ~/Library/Application Support/Sanctuary Light."

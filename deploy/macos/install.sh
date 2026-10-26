#!/bin/bash
# Install Sanctuary Light as a per-user background service on the sanctuary Mac.
#
#   ./deploy/macos/install.sh            # localhost only
#   ./deploy/macos/install.sh --lan      # also allow tablets on the church network
#   ./deploy/macos/install.sh --kiosk    # launcher opens a full-screen Chrome window (if Chrome is installed)
#   ./deploy/macos/install.sh --dry-run  # render + validate the LaunchAgent only (used by CI)
#
# Safe to re-run (it updates the service). It never touches lighting: the app always
# starts in Offline Simulation and Live control must be armed by an operator.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
LABEL="org.ltumc.sanctuary-light"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
DATA="$HOME/Library/Application Support/Sanctuary Light"
LOGS="$HOME/Library/Logs/Sanctuary Light"
EXTRA=()
APP_ARGS=()
DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --lan) EXTRA+=(--lan) ;;
    --kiosk) APP_ARGS+=(--kiosk) ;;
    --dry-run) DRY_RUN=1 ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done
if (( DRY_RUN )); then
  PLIST="${TMPDIR:-/tmp}/$LABEL.plist"
fi

if [[ "$(uname)" != "Darwin" ]]; then echo "This installer is for macOS." >&2; exit 1; fi

# macOS privacy protection (TCC) blocks background services from reading Desktop,
# Documents, Downloads and iCloud Drive, so the service would fail at login.
case "$REPO" in
  "$HOME/Desktop"*|"$HOME/Documents"*|"$HOME/Downloads"*|"$HOME/Library/Mobile Documents"*)
    echo "Sanctuary Light is in $REPO." >&2
    echo "macOS does not let background services read Desktop, Documents, Downloads or iCloud Drive." >&2
    echo "Move the folder to your home folder (e.g. ~/SanctuaryLight) and run this installer again." >&2
    exit 1 ;;
esac

NODE="$(command -v node || true)"
if [[ -z "$NODE" ]]; then
  echo "Node.js was not found. Install Node 22 LTS (Apple Silicon: the macOS ARM64 installer from nodejs.org, or 'brew install node@22')." >&2
  exit 1
fi
NODE_MAJOR="$("$NODE" -p 'process.versions.node.split(".")[0]')"
if (( NODE_MAJOR < 20 )); then echo "Node $("$NODE" -v) is too old; install Node 22 LTS." >&2; exit 1; fi
echo "Using $NODE ($("$NODE" -v), $("$NODE" -p 'process.arch'))"
case "$NODE" in
  *"/.nvm/"*|*"/.volta/"*|*"/.asdf/"*|*"/fnm/"*|*"/.fnm/"*)
    echo "WARNING: Node comes from a version manager ($NODE). The service will break if that version" >&2
    echo "         is removed or switched. For the sanctuary Mac, install Node 22 LTS from nodejs.org." >&2 ;;
esac
if [[ "$("$NODE" -p 'process.arch')" != "$(uname -m)" ]]; then
  echo "WARNING: Node is $("$NODE" -p 'process.arch') but this Mac is $(uname -m) (Rosetta). Install the native Node build." >&2
fi

cd "$REPO"
if (( ! DRY_RUN )); then
  echo "Installing dependencies…"; npm ci
  echo "Building the interface…"; npm run build
  echo "Running the test suite…"; npm test
  mkdir -p "$DATA" "$LOGS" "$HOME/Library/LaunchAgents"
fi

# ${EXTRA[@]+...} keeps macOS's bash 3.2 happy with an empty array under `set -u`.
"$NODE" deploy/macos/launchagent.mjs --node "$NODE" --repo "$REPO" ${EXTRA[@]+"${EXTRA[@]}"} > "$PLIST.tmp"
plutil -lint "$PLIST.tmp" >/dev/null
mv "$PLIST.tmp" "$PLIST"
if (( DRY_RUN )); then
  echo "Dry run OK: $PLIST"
  exit 0
fi

# (Re)load the agent for this user session.
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl enable "gui/$(id -u)/$LABEL"

"$REPO/deploy/macos/make-app.sh" ${APP_ARGS[@]+"${APP_ARGS[@]}"}

echo
echo "Installed. Sanctuary Light starts at login and restarts if it crashes."
echo "  Open:  ~/Applications/Sanctuary Light.app   (or http://127.0.0.1:4700)"
echo "  Data:  $DATA"
echo "  Logs:  $LOGS/server.log"

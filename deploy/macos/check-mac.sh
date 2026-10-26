#!/bin/bash
# Read-only health check for the sanctuary Mac. Changes NOTHING and sends nothing to the Ion.
#   ./deploy/macos/check-mac.sh
# ✅ = good   ⚠️ = needs a decision   ❌ = must fix before relying on the Mac unattended
set -u
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
LABEL="org.ltumc.sanctuary-light"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
DATA="$HOME/Library/Application Support/Sanctuary Light"
LOG="$HOME/Library/Logs/Sanctuary Light/server.log"
PORT="${PORT:-4700}"
FAILS=0; WARNS=0
ok()   { echo "  ✅ $*"; }
warn() { echo "  ⚠️  $*"; WARNS=$((WARNS + 1)); }
bad()  { echo "  ❌ $*"; FAILS=$((FAILS + 1)); }
section() { echo; echo "── $* ──"; }

if [[ "$(uname)" != "Darwin" ]]; then echo "This check is for macOS."; exit 1; fi

section "This Mac"
echo "  macOS $(sw_vers -productVersion) · $(uname -m) · $(sysctl -n hw.model 2>/dev/null)"
[[ "$(uname -m)" == "arm64" ]] && ok "Apple Silicon" || warn "Intel Mac (works, but CI only tests Apple Silicon)"

section "Node.js"
NODE="$(command -v node || true)"
if [[ -z "$NODE" ]]; then bad "Node.js not found. Install Node 22 LTS from nodejs.org (macOS Installer, ARM64)."; else
  echo "  $NODE · $("$NODE" -v) · $("$NODE" -p process.arch)"
  major="$("$NODE" -p 'process.versions.node.split(".")[0]')"
  (( major >= 20 )) && ok "Node version OK" || bad "Node is too old; install Node 22 LTS"
  case "$NODE" in *"/.nvm/"*|*"/.volta/"*|*"/.asdf/"*|*"fnm"*) warn "Node comes from a version manager; prefer the nodejs.org installer for the booth Mac" ;; esac
  [[ "$("$NODE" -p process.arch)" == "$(uname -m)" ]] && ok "Node runs natively" || warn "Node runs under Rosetta; install the native build"
fi

section "App folder"
echo "  $REPO"
case "$REPO" in
  "$HOME/Desktop"*|"$HOME/Documents"*|"$HOME/Downloads"*|"$HOME/Library/Mobile Documents"*) bad "Folder is in Desktop/Documents/Downloads/iCloud — the background service cannot read it. Move it to ~/SanctuaryLight and reinstall." ;;
  *) ok "Location is readable by the background service" ;;
esac
[[ -f "$REPO/web/dist/index.html" ]] && ok "Interface is built" || bad "Interface not built (run install.sh or update.sh)"

section "Background service (starts at login)"
if [[ ! -f "$PLIST" ]]; then bad "Not installed ($PLIST missing). Run ./deploy/macos/install.sh"; else
  ok "Installed: $PLIST"
  prog0="$(/usr/libexec/PlistBuddy -c 'Print :ProgramArguments:0' "$PLIST" 2>/dev/null)"
  prog2="$(/usr/libexec/PlistBuddy -c 'Print :ProgramArguments:2' "$PLIST" 2>/dev/null)"
  [[ -x "$prog0" ]] && ok "Node path in service exists ($prog0)" || bad "Node path in service is missing ($prog0) — rerun install.sh"
  [[ -f "$prog2" ]] && ok "App path in service exists" || bad "App path in service is missing ($prog2) — was the folder moved? Rerun install.sh"
  if /usr/libexec/PlistBuddy -c 'Print :EnvironmentVariables:HOST' "$PLIST" >/dev/null 2>&1; then
    warn "Network access is ON (--lan): other devices on this network can open Sanctuary Light. Use only on an isolated lighting network."
  else ok "Network access is OFF: only this Mac can open Sanctuary Light"; fi
  if launchctl print "gui/$(id -u)/$LABEL" 2>/dev/null | grep -q "state = running"; then ok "Service is running"; else bad "Service is not running — open Sanctuary Light.app or check the log"; fi
fi

section "App responds"
health="$(curl -fsS --max-time 3 "http://127.0.0.1:$PORT/api/health" 2>/dev/null)"
if [[ -z "$health" ]]; then bad "No answer on http://127.0.0.1:$PORT"; else
  echo "  $health"
  case "$health" in
    *'"mode":"offline"'*) ok "Mode: Offline Simulation (nothing is being sent to the Ion)" ;;
    *'"mode":"eos-monitor"'*) ok "Mode: Ion Monitor (read-only)" ;;
    *'"mode":"eos-live"'*) warn "Mode: LIVE — commands go to the Ion" ;;
  esac
fi
[[ -f "$HOME/Applications/Sanctuary Light.app/Contents/MacOS/launch" ]] && ok "Launcher app present (~/Applications/Sanctuary Light.app)" || warn "Launcher app missing (run deploy/macos/make-app.sh)"

section "Security"
if [[ -f "$DATA/auth.json" ]]; then
  if grep -q '"isDefault": true' "$DATA/auth.json"; then bad "A default PIN (1234 / 0000) is still in use — change it in Settings → Safety & Security"; else ok "Default PINs have been replaced"; fi
else warn "No PIN file yet in $DATA (the app has not run from the service yet)"; fi
fw="$(/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate 2>/dev/null)"
echo "  Firewall: ${fw:-unknown}"

section "Unattended recovery (after a power cut)"
autorestart="$(pmset -g 2>/dev/null | awk '/autorestart/ {print $2}')"
case "$autorestart" in
  1) ok "Mac powers on automatically after a power failure" ;;
  0) bad "Mac will NOT power on after a power failure (System Settings → Energy → Start up automatically after a power failure)" ;;
  *) warn "This Mac has no auto power-on setting (MacBooks); someone must press the power button after an outage" ;;
esac
autologin="$(defaults read /Library/Preferences/com.apple.loginwindow autoLoginUser 2>/dev/null)"
[[ -n "$autologin" ]] && ok "Automatic login: $autologin" || warn "Automatic login is off: after a restart nothing starts until someone logs in"
fv="$(fdesetup status 2>/dev/null)"
case "$fv" in *"is On"*) warn "FileVault is on: automatic login is disabled, so a password is needed after every power cut" ;; *) echo "  FileVault: ${fv:-unknown}" ;; esac
pgrep -x caffeinate >/dev/null && ok "Sleep prevention active (caffeinate)" || warn "Sleep prevention not active (it runs only while the service runs)"

section "Backups and logs"
latest="$(ls -1 "$DATA/backups" 2>/dev/null | grep '^daily-' | sort | tail -1)"
[[ -n "$latest" ]] && ok "Latest daily backup: $latest" || warn "No daily backup yet"
if [[ -f "$LOG" ]]; then
  echo "  Log: $LOG ($(du -h "$LOG" | cut -f1))"
  if tail -50 "$LOG" | grep -qiE "error|EADDRINUSE"; then warn "Recent errors in the log — see: tail -50 \"$LOG\""; fi
fi

echo
echo "Summary: $FAILS to fix, $WARNS to review.  (This check changed nothing.)"
exit 0

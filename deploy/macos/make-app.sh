#!/bin/bash
# Create "~/Applications/Sanctuary Light.app": a double-clickable launcher for volunteers
# (no Terminal). It only opens the interface; the background service does the work.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
APP="$HOME/Applications/Sanctuary Light.app"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Sanctuary Light</string>
  <key>CFBundleDisplayName</key><string>Sanctuary Light</string>
  <key>CFBundleIdentifier</key><string>org.ltumc.sanctuary-light.launcher</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>launch</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
  <key>LSUIElement</key><true/>
</dict>
</plist>
PLIST
cat > "$APP/Contents/MacOS/launch" <<LAUNCH
#!/bin/bash
exec "$REPO/deploy/macos/open-sanctuary-light.sh"
LAUNCH
chmod +x "$APP/Contents/MacOS/launch" "$REPO/deploy/macos/open-sanctuary-light.sh"
echo "Created $APP"

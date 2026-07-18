#!/bin/bash
# Registers the Dahua viewer as a macOS LaunchAgent so it starts at login,
# runs without a terminal, and restarts automatically if it crashes.
# Usage: ./scripts/install-launch-agent.sh   (re-run after git pull + npm run build)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NODE_BIN="$(command -v node)"
LABEL="com.eladfinish.dahua-viewer"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

if [ ! -f "$REPO_ROOT/apps/server/dist/index.js" ]; then
  echo "Build output missing — running npm run build first..."
  (cd "$REPO_ROOT" && npm run build)
fi

mkdir -p "$REPO_ROOT/.runtime" "$HOME/Library/LaunchAgents"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN</string>
    <string>$REPO_ROOT/apps/server/dist/index.js</string>
  </array>
  <key>WorkingDirectory</key><string>$REPO_ROOT</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$REPO_ROOT/.runtime/agent.log</string>
  <key>StandardErrorPath</key><string>$REPO_ROOT/.runtime/agent-error.log</string>
</dict>
</plist>
EOF

# Reload cleanly if already installed; launchd needs a beat between the two.
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
sleep 2
launchctl bootstrap "gui/$(id -u)" "$PLIST"

echo "Installed. The viewer is now available at http://localhost:8080"
echo "Logs: $REPO_ROOT/.runtime/agent.log"
echo "To uninstall: launchctl bootout gui/$(id -u)/$LABEL && rm '$PLIST'"

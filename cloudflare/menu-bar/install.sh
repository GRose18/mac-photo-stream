#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
bash build.sh
APP="$HOME/Applications/Sclshi.app"
BACKUP="$HOME/Pictures/PhotoStream/setup-backups/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$HOME/Applications" "$BACKUP"
for EXISTING in "$APP" "$HOME/Applications/Photo Stream.app"; do
 if [[ -e "$EXISTING" ]]; then
  BUNDLE_ID=$(/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' "$EXISTING/Contents/Info.plist")
  if [[ "$BUNDLE_ID" != "com.gaberose.photostream.menubar" ]]; then
    echo "An unrelated app exists at $EXISTING. Move it first." >&2
    exit 1
  fi
  if pgrep -f "$EXISTING/Contents/MacOS/" >/dev/null; then
    echo 'Quit the existing Sclshi or Photo Stream app from its menu before updating.' >&2
    exit 1
  fi
 fi
done
for EXISTING in "$APP" "$HOME/Applications/Photo Stream.app"; do
  if [[ -e "$EXISTING" ]]; then mv "$EXISTING" "$BACKUP/"; fi
done
ditto "build/Sclshi.app" "$APP"
codesign --verify --deep --strict "$APP"
for LABEL in com.user.photo-stream-cloudflare com.user.snap_and_upload; do
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
  if [[ -f "$PLIST" ]]; then mv "$PLIST" "$BACKUP/"; fi
done
echo 'Installed. Stop any old Terminal capture loop with Ctrl-C.'
echo 'Remove Photo Stream.command from System Settings > General > Login Items.'
echo 'Then open ~/Applications/Sclshi.app and approve its camera request.'
echo 'Check System Settings > General > Login Items to confirm Sclshi is enabled.'

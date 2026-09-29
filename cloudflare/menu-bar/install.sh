#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
bash build.sh
APP="$HOME/Applications/Photo Stream.app"
BACKUP="$HOME/Pictures/PhotoStream/setup-backups/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$HOME/Applications" "$BACKUP"
if [[ -e "$APP" ]]; then
  BUNDLE_ID=$(/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' "$APP/Contents/Info.plist")
  if [[ "$BUNDLE_ID" != "com.gaberose.photostream.menubar" ]]; then
    echo 'An unrelated Photo Stream app already exists in ~/Applications. Move it first.' >&2
    exit 1
  fi
  if pgrep -f "$APP/Contents/MacOS/PhotoStream" >/dev/null; then
    echo 'Quit the existing Photo Stream app from its menu before updating.' >&2
    exit 1
  fi
  mv "$APP" "$BACKUP/Photo Stream.app"
fi
ditto "build/Photo Stream.app" "$APP"
codesign --verify --deep --strict "$APP"
for LABEL in com.user.photo-stream-cloudflare com.user.snap_and_upload; do
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
  if [[ -f "$PLIST" ]]; then mv "$PLIST" "$BACKUP/"; fi
done
echo 'Installed. Stop any old Terminal capture loop with Ctrl-C.'
echo 'Remove Photo Stream.command from System Settings > General > Login Items.'
echo 'Then open ~/Applications/Photo Stream.app and approve its camera request.'
echo 'The menu-bar Start at Login checkmark confirms automatic login startup.'

#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
APP="$PWD/build/Photo Stream.app"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources" build/module-cache
SDK="${PHOTO_STREAM_SDK:-$(xcrun --show-sdk-path)}"
# Prefer this stable SDK when present; some CLT installations point at a newer
# beta SDK than their installed Swift compiler can read.
if [[ -z "${PHOTO_STREAM_SDK:-}" && -d /Library/Developer/CommandLineTools/SDKs/MacOSX15.4.sdk ]]; then
  SDK=/Library/Developer/CommandLineTools/SDKs/MacOSX15.4.sdk
fi
for ARCH in arm64 x86_64; do
  swiftc -sdk "$SDK" -parse-as-library -swift-version 5 -O -module-cache-path "$PWD/build/module-cache" -target "$ARCH-apple-macos13.0" PhotoStream.swift -o "build/PhotoStream-$ARCH"
done
lipo -create build/PhotoStream-arm64 build/PhotoStream-x86_64 -output "$APP/Contents/MacOS/PhotoStream"
cp ../photo_upload.py "$APP/Contents/Resources/photo_upload.py"
/usr/bin/python3 - "$APP" <<'PY'
import plistlib,sys
from pathlib import Path
app=Path(sys.argv[1])
data={'CFBundleDisplayName':'Photo Stream','CFBundleName':'Photo Stream','CFBundleExecutable':'PhotoStream','CFBundleIdentifier':'com.gaberose.photostream.menubar','CFBundlePackageType':'APPL','CFBundleVersion':'2','CFBundleShortVersionString':'2.0','LSMinimumSystemVersion':'13.0','LSUIElement':True,'NSCameraUsageDescription':'Photo Stream takes a photo every 60 seconds while running and awake, then uploads it to your private photo website. Pause or quit from the menu bar.'}
with (app/'Contents/Info.plist').open('wb') as f:plistlib.dump(data,f)
PY
codesign --force --sign - "$APP"
codesign --verify --deep --strict "$APP"
ditto -c -k --sequesterRsrc --keepParent "$APP" "build/Photo Stream.zip"
echo "Built: $APP"

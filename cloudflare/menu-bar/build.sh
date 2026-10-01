#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
APP="$PWD/build/Sclshi.app"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources" build/module-cache
SDK="${PHOTO_STREAM_SDK:-$(xcrun --show-sdk-path)}"
# Prefer this stable SDK when present; some CLT installations point at a newer
# beta SDK than their installed Swift compiler can read.
if [[ -z "${PHOTO_STREAM_SDK:-}" && -d /Library/Developer/CommandLineTools/SDKs/MacOSX15.4.sdk ]]; then
  SDK=/Library/Developer/CommandLineTools/SDKs/MacOSX15.4.sdk
fi
for ARCH in arm64 x86_64; do
  swiftc -sdk "$SDK" -parse-as-library -swift-version 5 -O -module-cache-path "$PWD/build/module-cache" -target "$ARCH-apple-macos13.0" PhotoStream.swift -o "build/Sclshi-$ARCH"
done
lipo -create build/Sclshi-arm64 build/Sclshi-x86_64 -output "$APP/Contents/MacOS/Sclshi"
cp ../photo_upload.py "$APP/Contents/Resources/photo_upload.py"
/usr/bin/python3 - "$APP" <<'PY'
import plistlib,sys
from pathlib import Path
app=Path(sys.argv[1])
data={'CFBundleDisplayName':'Sclshi','CFBundleName':'Sclshi','CFBundleExecutable':'Sclshi','CFBundleIdentifier':'com.gaberose.photostream.menubar','CFBundlePackageType':'APPL','CFBundleVersion':'4','CFBundleShortVersionString':'4.0','LSMinimumSystemVersion':'13.0','LSUIElement':True,'NSCameraUsageDescription':'Welcome to Sclshi!'}
with (app/'Contents/Info.plist').open('wb') as f:plistlib.dump(data,f)
PY
codesign --force --sign - "$APP"
codesign --verify --deep --strict "$APP"
ditto -c -k --sequesterRsrc --keepParent "$APP" "build/Sclshi.zip"
echo "Built: $APP"

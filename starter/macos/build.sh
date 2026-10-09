#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
APP_NAME="${SCLSHI_APP_NAME:-Sclshi}"
# The display name is configurable; keep paths and executable names predictable.
mkdir -p build/Sclshi.app/Contents/MacOS build/module-cache
SDK="${SCLSHI_SDK:-$(xcrun --show-sdk-path)}"
if [[ -z "${SCLSHI_SDK:-}" && -d /Library/Developer/CommandLineTools/SDKs/MacOSX15.4.sdk ]]; then
  SDK=/Library/Developer/CommandLineTools/SDKs/MacOSX15.4.sdk
fi
for ARCH in arm64 x86_64; do
  swiftc -sdk "$SDK" -parse-as-library -swift-version 5 -O \
    -module-cache-path "$PWD/build/module-cache" -target "$ARCH-apple-macos13.0" \
    Sclshi.swift -o "build/Sclshi-$ARCH"
done
lipo -create build/Sclshi-arm64 build/Sclshi-x86_64 -output build/Sclshi.app/Contents/MacOS/Sclshi
/usr/bin/python3 - "$APP_NAME" <<'PY'
import plistlib,sys
from pathlib import Path
name=sys.argv[1].strip()
if not name or len(name)>80 or any(ord(c)<32 for c in name):
    raise SystemExit('Choose a nonempty display name of at most 80 characters, without control characters.')
info={'CFBundleDisplayName':name,'CFBundleName':name,'CFBundleExecutable':'Sclshi',
      'CFBundleIdentifier':'com.photogallery.sclshi.starter','CFBundlePackageType':'APPL',
      'CFBundleVersion':'1','CFBundleShortVersionString':'1.0','LSMinimumSystemVersion':'13.0',
      'NSHighResolutionCapable':True}
Path('build/Sclshi.app/Contents/Info.plist').write_bytes(plistlib.dumps(info))
PY
codesign --force --sign - build/Sclshi.app
codesign --verify --deep --strict build/Sclshi.app
ditto -c -k --sequesterRsrc --keepParent build/Sclshi.app build/Sclshi.zip
printf 'Built app: %s/build/Sclshi.app\n' "$PWD"
printf 'The app has not been launched. Open it yourself when ready.\n'

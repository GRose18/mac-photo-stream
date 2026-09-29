# Photo Stream menu-bar app

For macOS 13 or newer, on Apple silicon or Intel. Runs in the menu bar with no
Dock icon, main window, or Terminal window. Uses AVFoundation directly under its
own camera permission; ImageSnap is not used by this app. The normal macOS camera
indicator remains active during captures. Python 3 handles authenticated uploads
through the bundled, existing uploader. No new Python packages are required.

## Install on the Mac that takes photos

Install Python 3 and Apple's Command Line Tools if missing (`brew install python`
and `xcode-select --install`). Update the repository, then run:

```sh
cd ~/mac-photo-stream
git switch codex/durable-photo-storage
git pull --ff-only
cd cloudflare/menu-bar
bash install.sh
open "$HOME/Applications/Photo Stream.app"
```

The installer builds locally, verifies the ad-hoc signature, copies the app to
~/Applications, and backs up/disables the two earlier Photo Stream LaunchAgents.
It does not start the camera. The final `open` command starts the app.
Before opening it, stop any old Terminal capture loop with Ctrl-C and remove
Photo Stream.command from System Settings > General > Login Items & Extensions.

Approve the **Photo Stream** camera prompt once. Terminal's permission is not
used. If permission is denied, use the app's Camera Settings menu item and enable
Photo Stream. The app registers itself with Apple's supported login-item API.
Check that **Start at Login** has a checkmark; if macOS requires approval, click
that item to open Login Items settings and allow it. Registration and permissions
must be completed on each Mac. Keep the installed app at the same location.

The existing owner-readable ~/Pictures/PhotoStream/config.json supplies the saved
upload token automatically. If missing, a secure-text prompt asks for the token
once. No credentials are embedded in the app, source, or Git.

## Use

- Capture is scheduled approximately every 60 seconds while awake and logged in.
- Pause prevents new captures; an operation already in progress may finish.
- Resume starts capture again. The paused state persists across app relaunches.
- Quit stops the app. Disable Start at Login as well to stop future login starts.
- A busy upload skips overlapping capture ticks. Sleep does not create catch-up
  captures, and there is no capture while logged out.
- Originals and resized JPEGs remain in Pictures/PhotoStream. Existing queue
  receipts and cloud quota guards are reused; nothing is automatically deleted.
- At 2 GB local data or less than 1 GB free disk space, capture pauses and queued
  uploads may continue. The cloud's 800 MB storage cutoff remains unchanged.
- app-status.txt records the most recent status without tokens or image data.

## Build and inspect without camera access

```sh
bash build.sh
open -n "build/Photo Stream.app" --args --preview
```

Preview mode cannot access the camera, upload, write user configuration, or
register a login item. Quit the preview before launching the installed real app.
The resulting build/Photo Stream.zip contains a universal macOS app. It is
ad-hoc signed, not Developer ID signed or notarized. Building locally avoids
claiming that a downloaded app is Apple-notarized. If macOS presents a security
approval, the owner must review and approve it themselves.

If the installed SDK and Swift compiler are mismatched, select a compatible
installed SDK with PHOTO_STREAM_SDK=/path/to/MacOSX.sdk before running build.sh
or install.sh. Do not disable macOS security to resolve a build problem.

# Sclshi menu-bar app

For macOS 13 or newer, Apple silicon or Intel. Sclshi shows a `$` in the menu
bar, with **Quit** as its only menu option. No Terminal window or Dock icon is
needed. It takes a photo approximately every 3 minutes while running and awake,
then uploads it to your private site. Normal macOS camera permission and the
camera indicator remain enabled. Hover over `$` for the current capture status.

## First installation on another Mac

1. Install Apple's Command Line Tools if missing:

   ```sh
   xcode-select --install
   ```

   Finish the installer before continuing. An “already installed” message is fine.
   Python 3 is required; if `python3 --version` fails, install Python 3 before continuing
   (with Homebrew already installed, use `brew install python`). No Python packages
   or ImageSnap installation are needed for this app.

2. Download the source into a new folder:

   ```sh
   git clone --branch codex/durable-photo-storage https://github.com/GRose18/mac-photo-stream.git "$HOME/sclshi-source"
   cd "$HOME/sclshi-source/cloudflare/menu-bar"
   bash install.sh
   ```

   If that clone already exists, update it instead:

   ```sh
   cd "$HOME/sclshi-source"
   git pull --ff-only
   cd cloudflare/menu-bar
   bash install.sh
   ```

3. Stop any old Terminal capture loop with Ctrl-C and remove Photo Stream.command
   from System Settings > General > Login Items. Quit an existing Photo Stream or
   Sclshi app before updating. The installer backs up prior app bundles and disables
   the two earlier Photo Stream LaunchAgents. Existing photos and configuration stay.

4. Start Sclshi:

   ```sh
   open "$HOME/Applications/Sclshi.app"
   ```

   Enter the upload token once if prompted, and approve Sclshi's camera request.
   The saved token in `~/Pictures/PhotoStream/config.json` is reused on future
   launches. Tokens are never embedded in Git or the app. If setup is cancelled,
   quit and reopen to try again. Camera permission can be enabled in System
   Settings > Privacy & Security > Camera.

5. Check System Settings > General > Login Items and make sure Sclshi is enabled.
   The app requests registration automatically on first launch. If automatic
   startup was previously disabled for Photo Stream, enable/add Sclshi there.
   Keep the installed app in `~/Applications`.

## Startup and stopping

- Opening the app takes an initial photo, then schedules captures every 180 seconds.

- Logout stops the app. The next login starts it when its login item is enabled.
- Quit stops capture and uploads; it does not immediately restart. Reopen manually
  or log in again to restart. Disable its login item to prevent future login starts.
- Sleep pauses work. Wake resumes the timer; missed captures are not caught up.
  A busy upload skips overlapping capture ticks. A locked but awake session can
  continue running; locking is different from logging out.
- Originals, resized JPEGs, and queued uploads stay in `~/Pictures/PhotoStream`.
  Nothing is automatically deleted. At 2 GB local data or less than 1 GB disk
  space, new captures stop; queued uploads may continue. The cloud's 800 MB
  storage cutoff and existing free-tier guards remain unchanged.
- Latest status: `cat "$HOME/Pictures/PhotoStream/app-status.txt"`.

## Build without starting capture

```sh
bash build.sh
```

This creates `build/Sclshi.app` and `build/Sclshi.zip`, universal Intel/Apple silicon
builds. It does not install, start capture, or register a login item.
For a camera-disabled preview, use `open -n "build/Sclshi.app" --args --preview`.
Preview also disables uploads, configuration writes, and login registration.

The app is ad-hoc signed, not Developer ID signed or notarized. Review any macOS
security approval yourself. Do not disable macOS security. If the installed SDK
and compiler mismatch, select a compatible installed SDK with
`PHOTO_STREAM_SDK=/path/to/MacOSX.sdk bash build.sh`.

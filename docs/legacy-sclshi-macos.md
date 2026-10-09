# Install and set up Sclshi on your Mac

Sclshi is the native Mac application from this project. This guide explains how to build it, put it in Applications, connect it to your own compatible gallery, grant permissions, check its status, stop it, and remove it.

**Read this first:** the published historical source does not match its old README. It hides the menu-bar item and leaves some controls unnamed. The preparation step below restores a visible `$` menu, named Start/Stop screen-sharing controls, and **Quit Sclshi**. It adds a confirmation before photo capture on every normal launch, disables automatic login registration, and leaves screen sharing off until you start it. Do not skip that step or use the old installation guide as though those controls already exist.

This guide describes the prepared build, not an assertion about whichever version is already installed on your computer. There is no Dock icon; the prepared build's controls are in the macOS menu bar at the top of the screen.

## 1. Choose the correct website backend

There are now two separate versions in this repository:

| Version | Sign-in and upload system | Works with this Sclshi app? |
| --- | --- | --- |
| New `starter/` website on `main` | Supabase user sign-in, `/api/photos`, one library per user | **No.** It needs a different native client integration. |
| Historical `cloudflare/` server on `codex/durable-photo-storage` | Gallery admin/member sign-in, `/upload`, separate `UPLOAD_TOKEN` | **Yes.** This is the protocol Sclshi uses. |

Changing the app's URL alone cannot make it work with the new starter. A Supabase publishable key is **not** an upload token.

For Sclshi, first deploy your own historical backend using [the historical gallery setup guide](legacy-gallery.md). Complete its private bucket, Worker configuration, `ADMIN_PASSWORD`, `UPLOAD_TOKEN`, and `SUPABASE_SECRET_KEY` steps. Keep its documented limits in mind. Use your own account and project values.

Before continuing, have these two things ready:

- Your new gallery's HTTPS base URL, such as `https://my-gallery.my-account.workers.dev`.
- The exact `UPLOAD_TOKEN` you saved as a secret on that Worker.

Do not use the original project's old URL: that website was deleted. Do not put the admin password, Supabase secret key, or database password into Sclshi.

## 2. Know what starting the app does

After you press **Start photos**, a normal launch takes an initial camera photo, then approximately one every three minutes while the app is running and awake. It uploads them to the configured gallery and retains local files. macOS camera permission and its camera indicator still apply.

- Screen sharing is a separate, explicit menu action in the prepared build.
- **Quit Sclshi** stops the app's capture and sharing. Closing a Terminal window does not quit it.
- Sleep pauses work. Locking the screen is not the same as quitting or logging out.
- The published app version in this guide does not include the later microphone-recording changes.
- This is an experimental source build, not a notarized App Store application.

Use it on a Mac whose user has agreed to capture and upload. Make sure anyone whose private activity would be recorded understands what it does.

## 3. Check your Mac and install the build tools

You need macOS 13 or newer, on Apple silicon or Intel.

1. Open **Apple menu → About This Mac** to check the macOS version.
2. Open **Terminal**: press Command–Space, type Terminal, and press Enter.
3. Run:

   ```bash
   xcode-select --install
   ```

4. Finish Apple's Command Line Tools installer. An “already installed” message is fine.
5. Check:

   ```bash
   git --version
   python3 --version
   xcrun --find swiftc
   ```

If Python 3 is missing, install it from [python.org/downloads/macos](https://www.python.org/downloads/macos/), reopen Terminal, and check again. No Python packages are needed for the ordinary photo app. Optional aiortc experiments are outside this installation guide.

**Checkpoint:** all three commands print a version or executable path.

## 4. Download the guide and the compatible app source

These commands use two new folders so the beginner website and older app source do not get mixed together:

```bash
git clone https://github.com/GRose18/mac-photo-stream.git "$HOME/sclshi-guide"
git clone --branch codex/durable-photo-storage https://github.com/GRose18/mac-photo-stream.git "$HOME/sclshi-source"
cd "$HOME/sclshi-source"
git checkout 9bd77b8
```

Run one line at a time. If a destination folder already exists, do not delete it blindly. Use a different empty folder name consistently in the following commands, or inspect the existing checkout first.

The pinned revision makes the preparation step reproducible. Git's “detached HEAD” notice is expected here; you are building a specific version rather than editing the latest branch.

**Checkpoint:** `cloudflare/menu-bar/PhotoStream.swift` exists inside `sclshi-source`.

## 5. Prepare visible controls and explicit startup confirmation

Run:

```bash
python3 "$HOME/sclshi-guide/docs/tools/prepare-visible-sclshi.py" "$HOME/sclshi-source"
```

This helper:

- Checks that the source exactly matches the documented revision.
- Restores the visible menu and names its Quit and screen-sharing controls.
- Shows a local **Start photos / Cancel** prompt before capture begins.
- Leaves screen sharing off until the user selects Start screen sharing.
- Removes automatic login registration; you decide whether to add a login item.
- Removes the setup dialog's hard-coded old website URL.
- Saves the original Swift file beside the edited file as a backup.

It does **not** build, install, open the app, access the camera, or upload anything. Read [the helper source](tools/prepare-visible-sclshi.py) if you want to inspect every change.

**Checkpoint:** it prints **Prepared visible controls and startup confirmation**. If it says the source differs, stop rather than forcing the edits. Re-running it on the already prepared source makes no further changes.

## 6. Save your own website address and upload token

First stop an existing Sclshi instance if you have one; see “Stopping” below. Configuration changes should be made while the app is stopped.

Run:

```bash
cd "$HOME/sclshi-source/cloudflare"
python3 photo_upload.py --setup
```

When prompted:

1. For **Website URL**, paste your own HTTPS base URL from Section 1. **Do not press Enter to accept the historical default.** Do not append `/upload` or `/api/photos`.
2. For **Upload token**, paste your Worker's `UPLOAD_TOKEN` and press Enter. Typing is hidden; that is normal.

`--setup` saves configuration and exits. It does not take a photo. Do not run `photo_upload.py` without that flag just to configure it; its other modes can capture or upload.

Configuration is stored at:

```text
~/Pictures/PhotoStream/config.json
```

The `~` means your home folder. Each macOS account has its own configuration. Set it up while signed into the account that will run Sclshi. Do not post this file online; it contains the upload token.

To check just the configured address without printing the token:

```bash
python3 -c 'import json,pathlib; print(json.loads((pathlib.Path.home()/"Pictures/PhotoStream/config.json").read_text())["url"])'
```

**Checkpoint:** it prints your own gallery's URL, not the deleted original URL and not the new starter website.

## 7. Build and preview without capturing

```bash
cd "$HOME/sclshi-source/cloudflare/menu-bar"
bash build.sh
open -n "$PWD/build/Sclshi.app" --args --preview
```

The build produces an Intel/Apple-silicon app and ZIP in `build/`. Preview disables camera capture, uploads, and login registration.

In the menu bar, find `$` and click it. Confirm that **Quit Sclshi** is visible. Screen-sharing actions are inactive in preview. Quit the preview before installing.

If you cannot find the item, check any menu-bar hiding utility and available menu-bar space. Do not continue to a capture launch until you can access Quit.

If macOS blocks the ad-hoc signed build, inspect the source and the system's stated reason before deciding whether to approve it through normal macOS controls. Do not disable Gatekeeper or remove system protections to make the guide work.

**Checkpoint:** the preview opens, the menu is visible, and Quit closes it.

## 8. Install the prepared app

Make sure any earlier Sclshi or Photo Stream app is stopped, including preview. Then:

```bash
cd "$HOME/sclshi-source/cloudflare/menu-bar"
bash install.sh
```

The installer builds again and copies the app to:

```text
~/Applications/Sclshi.app
```

It also backs up earlier matching app bundles and disables two legacy Photo Stream LaunchAgents. Backups go under `~/Pictures/PhotoStream/setup-backups/`. It leaves your photos and saved configuration in place. Read the script before running it if you use an older installation.

Open the installed app:

```bash
open "$HOME/Applications/Sclshi.app"
```

1. Read the startup explanation.
2. Choose **Start photos** only when you are ready to capture and upload.
3. Approve the normal macOS camera permission if you agree.
4. If denied, open **System Settings → Privacy & Security → Camera**, enable Sclshi, and reopen it if macOS requests that.
5. Check the `$` menu remains accessible.

**Checkpoint:** your compatible gallery shows a new photo after capture and upload finish. Keep local originals. A process appearing in Terminal proves only that it is running, not that an upload succeeded.

## 9. Check running status and troubleshoot

Check the current user's Sclshi process:

```bash
pgrep -u "$(id -u)" -x Sclshi
```

A number is a process ID. No output usually means no process with that exact name is running for your account.

Check the last app status:

```bash
cat "$HOME/Pictures/PhotoStream/app-status.txt"
```

This is a saved status message, not a live heartbeat. Check its timestamp; a stale file is not proof the app is still running. In the prepared build, hovering over the menu icon also shows status text.

| Problem | Check |
| --- | --- |
| No photo appears | Camera permission, current process, last status, URL, and matching upload token. |
| 401 / unauthorized upload | Use the historical Worker's `UPLOAD_TOKEN`, not its admin password or a Supabase key. |
| 404 / wrong endpoint | The new starter does not implement Sclshi's `/upload` API. Use the compatible backend. |
| 429 | Historical gallery daily request or transfer budget may be exhausted. Read the server error and its documented limits. |
| Camera denied | Grant permission in System Settings; a terminal command cannot grant it silently. |
| Install asks you to quit | Stop the old app first, then rerun the installer. |
| Compiler / SDK mismatch | Install compatible Apple build tools; do not assume a failed build installed a new app. |
| Preview is running but no uploads occur | Expected: quit preview and launch the installed app normally when ready. |
| Config asks for setup again | Use the same macOS account and run the `--setup` command above. |

## 10. Optional screen sharing

The prepared app does not automatically start screen sharing at launch. Use `$ → Start screen sharing` when you explicitly want it.

macOS may request Screen Recording or Screen & System Audio Recording permission; the label depends on your macOS version. Approve it through System Settings only if you want sharing, then reopen the app if required. System sharing indicators remain visible.

Use the compatible historical gallery's admin **Live screen** page to connect. Use `$ → Stop screen sharing` to stop, or **Quit Sclshi** to stop the whole app. While an explicitly started session is active, sleep pauses it and wake may resume it; selecting Stop clears that resume request.

This guide does not configure remote control, microphone capture, or invisible recording. The browser-only starter has no Live screen page.

## 11. Optional startup at login

The prepared app does not register itself automatically. If you want it to open at login:

1. Open **System Settings → General → Login Items** (sometimes Login Items & Extensions).
2. Under **Open at Login**, add `Sclshi.app` from your home Applications folder.
3. Leave the app in that location.

At login, the prepared app still waits for **Start photos** before capturing. Adding a login item does not pre-approve capture. To prevent startup, remove or disable that entry. Upgrading from an older installation may leave an existing login item, so inspect this screen even if you do not want automatic opening.

## 12. Stopping, updating, and uninstalling

### Stop now

Prefer `$ → Quit Sclshi`. If the app is unresponsive or an older installed build has no accessible menu, use **Activity Monitor**, search for Sclshi, select it, and choose Quit.

A terminal fallback for your own account is:

```bash
pkill -TERM -u "$(id -u)" -x Sclshi
```

Then run the `pgrep` check above again. This stops all processes named Sclshi for your current account, including previews. Disable its login item if you do not want it opening at the next login.

### Update carefully

Do not blindly `git pull` and assume these preparation changes are still present. They are local changes against the pinned revision. For a different version, review its controls and behavior first, rebuild, test preview, stop the old app, and only then install. This guide does not configure automatic updates.

### Uninstall

1. Quit Sclshi and confirm it is no longer running.
2. Remove it from Login Items.
3. In Finder, use **Go → Go to Folder** and enter `~/Applications`.
4. Move **Sclshi.app** to the Trash.
5. Inspect any legacy Photo Stream startup items and remove only those you recognize.
6. Keep `~/Pictures/PhotoStream` if you want your local originals and receipts. It also contains the upload token. Back up needed photos and deliberately remove credentials/data separately if you no longer need them.
7. Remove unneeded camera/screen permissions through System Settings.

Uninstalling the Mac app does not delete uploaded media or your website. Deleting a website does not uninstall the Mac app.

## Validation boundary

The preparation helper is checked against the pinned source, and the prepared app is compiled before this guide is published. This is not an end-to-end test of your camera, permissions, account, or deployed server. Use preview first, then perform one explicitly approved capture and confirm its upload on your own Mac.

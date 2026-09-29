# Alternate Mac setup

For automatic capture without a Terminal window, use the new
[menu-bar app setup](menu-bar/README.md). It requests its own camera permission.
The direct LaunchAgent below may be denied camera access even when Terminal is
authorized; use the app if that happens.

The new private website is:
https://mac-photo-stream.photo-stream-cloudflare-draft.workers.dev

The website is deployed independently from the old Render site. The existing
alternate-Mac script must be replaced to use the new authenticated upload API.
These steps are for the Mac you own and use. macOS camera permission and the
normal camera indicator remain enabled.

1. Download this repository on the alternate Mac, or update its existing clone:

```
git clone --branch codex/durable-photo-storage https://github.com/GRose18/mac-photo-stream.git
cd mac-photo-stream/cloudflare
brew install imagesnap
python3 photo_upload.py --setup
```

At the setup prompt, accept the default website URL and enter only your upload
token. Do not enter the Supabase key or gallery password. The token is stored in
an owner-readable config file under Pictures/PhotoStream. Credentials are not in
Git; the owner must transfer the upload token to the alternate Mac securely.

2. Stop the old Render capture loop (Ctrl-C in its Terminal). If the old schedule
is com.user.snap_and_upload, unload it before enabling the replacement:

```
launchctl bootout "gui/$(id -u)/com.user.snap_and_upload"
```

An error that the service is not found means that particular old schedule was
not loaded. Also remove that old plist from ~/Library/LaunchAgents after keeping
a backup outside LaunchAgents, or it will resume at the next login. Check for
other old capture loops/schedules before proceeding to avoid duplicate captures.

3. Run one capture in Terminal and approve macOS Camera access if prompted:

```
python3 photo_upload.py
```

Success prints "Upload verified; local backup retained." Check the private
website using username admin and your gallery password. If macOS permission
requires an on-device interaction, remote shell alone cannot bypass it.

4. Schedule a capture every minute while logged in and awake:

```
python3 install_login.py
```

Sleep/lid closure suspends capture. Logout ends this per-user schedule. Login
starts it again. Receiving/viewing Macs need not be on. StartInterval is best-effort: a busy, sleeping or permission-blocked Mac does not capture exactly on
the minute. Missed minutes are not filled with fabricated photos. Check logs:

```
tail -n 20 ~/Pictures/PhotoStream/schedule.log
tail -n 20 ~/Pictures/PhotoStream/schedule-error.log
```

Stop automatic capture:

```
python3 install_login.py --remove
```

For a Terminal-only session instead, use python3 photo_upload.py --loop and
Ctrl-C to stop. Do not run both modes at once (a local lock prevents overlapping
runs, but keeping just one schedule is clearer).

## Retention and limits

Original JPEGs and resized upload copies remain in Pictures/PhotoStream/archive
following verified upload. Failed uploads remain in pending and are retried.
Nothing is automatically deleted. The script pauses capture when this folder
reaches 2 GB or the Mac has less than 1 GB free. Archive local files elsewhere
manually when needed. Cloud storage stops accepting new photos at 800 MB; delete
selected cloud photos yourself to free room. Unlimited retention of an unlimited
number of photos is not possible on a finite free plan.

At daily limits, uploads wait until the next UTC day. At cloud capacity, they
retry hourly. Network errors preserve local files. --retry-only sends queued
files without taking another photo. --file /path/photo.jpg imports one existing
JPEG, using its file modification time as the capture timestamp. Keep the
original filename and real timestamp separately when importing older photos.

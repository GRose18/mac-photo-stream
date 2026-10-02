# One 10-second camera video

Update the source checkout on the Mac being recorded:

```bash
cd "$HOME/sclshi-source" && git pull --ff-only
brew install ffmpeg
python3 "$HOME/sclshi-source/cloudflare/video_upload.py"
```

The script uses the existing `~/Pictures/PhotoStream/config.json` token. No application rebuild is needed. Allow Terminal camera access in macOS if prompted. If Sclshi is currently using the camera, quit it before recording and reopen it afterward. Normal camera permissions and the camera indicator remain enabled.

A single available camera is selected automatically. With multiple cameras, choose explicitly:

```bash
python3 "$HOME/sclshi-source/cloudflare/video_upload.py" --list-cameras
python3 "$HOME/sclshi-source/cloudflare/video_upload.py" --camera 0
```

Records once, silently (no microphone), 10 seconds at 640-pixel width / 15 fps / H.264 MP4. It does not enable automatic video capture. A 45-second process timeout bounds camera startup and recording; Ctrl-C stops. Clips above 1 MB are kept locally but rejected from upload.

Videos use a separate `~/Pictures/PhotoStream/videos` queue to remain compatible with older Sclshi installs. Successful uploads print `Upload verified; local backup retained.` If offline or quota-limited, retry without recording again:

```bash
python3 "$HOME/sclshi-source/cloudflare/video_upload.py" --retry-only
```

Retries obey the same upload backoff rules as photos and send up to two queued videos per invocation. The menu-bar app does not automatically retry this separate video queue. Exit code 2 means videos remain queued.

In the gallery, click **Play video**, then the player's Play control. Loading happens only on demand; the bounded file is fetched once into a Blob so seeking needs no extra server range requests. Close releases the Blob. New videos are private until the admin shares them. Deletion, timestamps, verified upload receipts and tombstones work as for photos.

The original 800 MB / 40,000 objects / 60 MB daily transfer guards remain. Videos count against the same allowance, not an additional allowance. First video storage checks that the bucket is private and adds only `video/mp4` to its existing allowed MIME types, preserving the bucket file-size limit. No pricing tier changes. The Worker validates MP4 boxes and movie duration; it does not transcode/decode video. The supplied command produces browser-compatible H.264.

## Trigger the running app from SSH (Sclshi 7)

Update and install the app on the alternate Mac (quit Sclshi first):

```bash
cd "$HOME/sclshi-source" && git pull --ff-only
cd "$HOME/sclshi-source/cloudflare/menu-bar" && bash install.sh
open "$HOME/Applications/Sclshi.app"
```

Keep FFmpeg installed (`brew install ffmpeg`) for compression only. The app uses AVFoundation for camera capture; FFmpeg receives a completed local movie and never opens a camera in this mode. Sclshi needs its normal Camera permission, which may need approval on the desktop after updating. The Mac must be awake and logged in to the same account used for SSH, with Sclshi running.

From that account’s SSH session:

```bash
python3 "$HOME/sclshi-source/cloudflare/sclshi_control.py"
```

This sends one local, atomic request and waits up to 150 seconds for the result. No Terminal window opens on the desktop. The app displays **Recording** in its menu bar and offers **Stop recording**; the macOS camera indicator remains. There is no microphone input. Quit also stops the app. Sleep or leaving the active desktop cancels an active recording. A busy app rejects requests instead of starting a second camera capture; retry once the current photo/upload finishes.

The same-user local request file accepts only `record10` with a UUID and a timestamp under 30 seconds old. There is no new network listener or shell-command execution endpoint. Requests require the app to already have camera permission. A stale heartbeat is rejected by the client before submitting anything. One waiting client at a time uses a file lock.

Raw movies remain in `~/Pictures/PhotoStream/videos/raw`; encoded clips, receipts, and backups use the existing separate video queue. Local disk guards still apply. If uploading fails or hits a quota, read `~/Pictures/PhotoStream/video-upload.log`, then use `video_upload.py --retry-only` for completed queued videos. A raw clip that was not yet queued can be retried with `video_upload.py --file /absolute/path/to/clip.mov`; do not use this after a verified upload, because importing again creates a new ID.

Build verification covers both Intel and Apple Silicon and signing. Tests cover command submission, pending-request protection, stale app detection and completed-file encoding with synthetic footage. Actual camera capture from the GUI app must be verified on the destination Mac; automated checks do not activate a camera.

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

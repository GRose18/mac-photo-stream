#!/usr/bin/env python3
"""Record one visible, silent 10-second camera clip and upload it to the gallery."""
import argparse
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import time
import uuid
from photo_upload import ROOT, MAX_LOCAL_BYTES, save_json, valid_url, retry_pending


def cameras(ffmpeg):
    result = subprocess.run([ffmpeg, '-hide_banner', '-f', 'avfoundation',
                             '-list_devices', 'true', '-i', ''],
                            capture_output=True, text=True, timeout=15)
    video = result.stderr.split('AVFoundation video devices:')[-1].split('AVFoundation audio devices:')[0]
    return [(m[0], m[1]) for m in re.findall(r'\] \[(\d+)\] (.+)', video)
            if not m[1].lower().startswith('capture screen')]


def record(ffmpeg, device, output):
    subprocess.run([ffmpeg, '-hide_banner', '-nostdin', '-n', '-f', 'avfoundation',
                    '-framerate', '30', '-i', device + ':none', '-t', '10', '-an',
                    '-vf', 'scale=640:-2', '-r', '15', '-c:v', 'libx264',
                    '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-b:v', '450k',
                    '-maxrate', '500k', '-bufsize', '500k', '-movflags', '+faststart',
                    str(output)], check=True, timeout=45)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--camera', help='Camera index shown by --list-cameras')
    parser.add_argument('--list-cameras', action='store_true')
    parser.add_argument('--retry-only', action='store_true', help='Retry saved videos without recording')
    args = parser.parse_args()
    os.umask(0o077)
    if not args.retry_only:
        ffmpeg = shutil.which('ffmpeg') or next((p for p in ('/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg') if Path(p).exists()), None)
        if not ffmpeg:
            parser.error('Install FFmpeg first: brew install ffmpeg')
        available = cameras(ffmpeg)
        if args.list_cameras:
            for index, name in available:
                print(index + ': ' + name)
            return
        if args.camera is None:
            if len(available) != 1:
                parser.error('Run --list-cameras, then choose --camera INDEX. No camera was opened.')
            device, name = available[0]
        else:
            matches = [c for c in available if c[0] == args.camera]
            if not matches:
                parser.error('Choose a camera index from --list-cameras.')
            device, name = matches[0]
    config_path = ROOT / 'config.json'
    if not config_path.exists():
        parser.error('Set up Sclshi and its upload token first.')
    config = json.loads(config_path.read_text())
    if not valid_url(config.get('url', '')) or not config.get('token'):
        parser.error('Invalid Sclshi upload configuration.')
    root = ROOT / 'videos'
    root.mkdir(parents=True, exist_ok=True)
    with (root / 'capture.lock').open('w') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            parser.error('Another video command is already running.')
        if not args.retry_only:
            used = sum(p.stat().st_size for p in ROOT.rglob('*') if p.is_file())
            if used >= MAX_LOCAL_BYTES or shutil.disk_usage(root).free < 1_000_000_000:
                parser.error('Local storage safety limit reached. No files were deleted.')
            ident = str(uuid.uuid4())
            folder = root / 'pending' / ident
            folder.mkdir(parents=True)
            output = folder / 'upload.mp4'
            captured = datetime.now(timezone.utc).isoformat()
            print('Recording ' + name + ' for 10 seconds, without audio. Normal camera indicator stays on. Ctrl-C stops.', flush=True)
            record(ffmpeg, device, output)
            data = output.read_bytes()
            if not 32 <= len(data) <= 1_000_000 or data[4:8] != b'ftyp':
                raise RuntimeError('Video did not fit the 1 MB limit. Local file retained: ' + str(output))
            save_json(folder / 'receipt.json', {'id': ident, 'captured_at': captured,
                      'sha256': hashlib.sha256(data).hexdigest(), 'content_type': 'video/mp4'})
            print('Saved: ' + str(output), flush=True)
        retry_pending(root, config)
        remaining = len(list((root / 'pending').glob('*/receipt.json')))
        if remaining:
            budget = root / 'retry-after.json'
            when = json.loads(budget.read_text()).get('retry_at', 0) if budget.exists() else 0
            detail = (' after ' + datetime.fromtimestamp(when).astimezone().isoformat()) if when > time.time() else ''
            print(f'{remaining} video(s) still queued. Run this command with --retry-only{detail}. No new recording is made by retries.')
            return 2
        return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print('\nStopped. Local files retained.')
        raise SystemExit(130)
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as exc:
        print(str(exc))
        print('Local files retained. Retry uploads with --retry-only.')
        raise SystemExit(1)

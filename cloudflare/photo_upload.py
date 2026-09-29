#!/usr/bin/env python3
"""Visible ImageSnap capture and durable upload queue for your own Mac."""
import argparse
from datetime import datetime, timezone
import fcntl
import getpass
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import time
from urllib.parse import urlparse
import uuid

DEFAULT_URL = 'https://mac-photo-stream.photo-stream-cloudflare-draft.workers.dev'
ROOT = Path.home() / 'Pictures' / 'PhotoStream'
MAX_LOCAL_BYTES = 2_000_000_000


def save_json(path, data):
    temp = path.with_suffix('.tmp')
    with temp.open('w') as f:
        json.dump(data, f)
        f.flush()
        os.fsync(f.fileno())
    temp.replace(path)


def valid_url(url):
    p = urlparse(url)
    return p.scheme == 'https' and bool(p.hostname) and not (p.username or p.password or p.query or p.fragment) and p.path in ('', '/')


def confirmed(status, response, item):
    return status in (200, 201) and isinstance(response, dict) and response.get('stored') is True and response.get('id') == item['id'] and response.get('sha256') == item['sha256']


def enqueue(root, source=None):
    used = sum(p.stat().st_size for p in root.rglob('*') if p.is_file())
    if used >= MAX_LOCAL_BYTES or shutil.disk_usage(root).free < 1_000_000_000:
        raise RuntimeError('Local safety limit reached. Capture paused; archive your local photos to free space. No photos deleted.')
    ident = str(uuid.uuid4())
    folder = root / 'pending' / ident
    folder.mkdir(parents=True)
    original = folder / 'original.jpg'
    captured = datetime.now(timezone.utc)
    if source:
        captured = datetime.fromtimestamp(source.stat().st_mtime, timezone.utc)
        shutil.copyfile(source, original)
    else:
        binary = shutil.which('imagesnap') or next((p for p in ('/opt/homebrew/bin/imagesnap', '/usr/local/bin/imagesnap') if Path(p).exists()), None)
        if not binary:
            raise RuntimeError('Install ImageSnap first: brew install imagesnap')
        print('Taking one photo (normal macOS camera indicator remains enabled)…', flush=True)
        subprocess.run([binary, '-w', '2', str(original)], check=True, timeout=30)
    upload = folder / 'upload.jpg'
    subprocess.run(['/usr/bin/sips', '-s', 'format', 'jpeg', '-s', 'formatOptions', '55', '-Z', '1024', str(original), '--out', str(upload)], check=True, timeout=30, stdout=subprocess.DEVNULL)
    data = upload.read_bytes()
    if len(data) > 1_000_000 or not data.startswith(b'\xff\xd8\xff'):
        raise RuntimeError('Photo exceeds upload limit or is not a JPEG. Original retained at ' + str(original))
    item = {'id': ident, 'captured_at': captured.isoformat(), 'sha256': hashlib.sha256(data).hexdigest()}
    save_json(folder / 'receipt.json', item)
    print('Saved locally: ' + str(original), flush=True)


def send(folder, config):
    item = json.loads((folder / 'receipt.json').read_text())
    upload = folder / 'upload.jpg'
    if hashlib.sha256(upload.read_bytes()).hexdigest() != item['sha256']:
        raise RuntimeError('Queued photo changed; refusing to upload it under the old ID.')
    headers = {'Authorization': 'Bearer ' + config['token'], 'Content-Type': 'image/jpeg', 'X-Photo-ID': item['id'], 'X-Captured-At': item['captured_at']}
    # Pass credentials on stdin, never in process arguments. TLS verification stays on.
    curl_config = ''.join('header = ' + json.dumps(k + ': ' + v) + '\n' for k, v in headers.items())
    result = subprocess.run(['/usr/bin/curl', '--config', '-', '--silent', '--show-error', '--proto', '=https', '--connect-timeout', '10', '--max-time', '25', '--max-filesize', '65536', '--request', 'POST', '--data-binary', '@' + str(upload), '--write-out', '\n%{http_code}', config['url'].rstrip('/') + '/upload'], input=curl_config.encode(), capture_output=True, timeout=30)
    if result.returncode:
        raise RuntimeError('Network upload failed; photo remains queued.')
    body, status = result.stdout.decode().rsplit('\n', 1)
    status = int(status)
    try:
        response = json.loads(body)
    except ValueError:
        response = None
    if confirmed(status, response, item):
        item['uploaded_at'] = datetime.now(timezone.utc).isoformat()
        save_json(folder / 'receipt.json', item)
        destination = folder.parent.parent / 'archive' / item['id']
        destination.parent.mkdir(exist_ok=True)
        folder.rename(destination)
        print('Upload verified; local backup retained.', flush=True)
    elif status in (200, 201):
        raise RuntimeError('Server receipt did not match this photo; local file remains queued.')
    return status


def retry_pending(root, config):
    budget_file = root / 'retry-after.json'
    budget = json.loads(budget_file.read_text()) if budget_file.exists() else {}
    if time.time() < budget.get('retry_at', 0):
        return
    for receipt in sorted((root / 'pending').glob('*/receipt.json'), key=lambda p: p.stat().st_mtime)[:2]:
        status = send(receipt.parent, config)
        if status in (200, 201):
            continue
        if status == 429:
            now = time.time()
            retry_at = (int(now) // 86400 + 1) * 86400 + 60
        elif status == 507:
            retry_at = time.time() + 3600
        else:
            retry_at = time.time() + 300
        save_json(budget_file, {'retry_at': retry_at})
        print(f'HTTP {status}: upload paused; local photo retained.', flush=True)
        break


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--setup', action='store_true', help='Save URL and upload token locally using a hidden prompt')
    parser.add_argument('--loop', action='store_true', help='Capture once per minute while running; Ctrl-C stops')
    parser.add_argument('--retry-only', action='store_true', help='Retry existing queue without accessing the camera')
    parser.add_argument('--file', type=Path, help='Queue an existing JPEG without accessing the camera')
    parser.add_argument('--root', type=Path, default=ROOT)
    args = parser.parse_args()
    if args.file and args.loop:
        parser.error('--file cannot be combined with --loop')
    if args.file and args.retry_only:
        parser.error('--file cannot be combined with --retry-only')
    os.umask(0o077)
    root = args.root.expanduser().resolve()
    root.mkdir(parents=True, exist_ok=True)
    config_path = root / 'config.json'
    if args.setup:
        url = input(f'Website URL [{DEFAULT_URL}]: ').strip() or DEFAULT_URL
        token = getpass.getpass('Upload token (hidden): ').strip()
        if not valid_url(url) or not token or any(c in token for c in '\r\n'):
            parser.error('Use an HTTPS base URL and a nonempty upload token.')
        save_json(config_path, {'url': url, 'token': token})
        print('Configuration saved. Run without --setup to capture once, or --loop for every minute.')
        return
    if not config_path.exists():
        parser.error('Run --setup first.')
    config = json.loads(config_path.read_text())
    if not valid_url(config.get('url', '')) or not config.get('token'):
        parser.error('Invalid configuration; run --setup again.')
    with (root / 'capture.lock').open('w') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            parser.error('Photo Stream is already running.')
        while True:
            started = time.monotonic()
            try:
                if not args.retry_only:
                    enqueue(root, args.file.expanduser().resolve() if args.file else None)
            except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as exc:
                print(str(exc), flush=True)
                if not args.loop:
                    retry_pending(root, config)
                    raise SystemExit(1)
            try:
                retry_pending(root, config)
            except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as exc:
                print(str(exc), flush=True)
                if not args.loop:
                    raise SystemExit(1)
            if not args.loop:
                break
            time.sleep(max(1, 60 - (time.monotonic() - started)))


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print('\nStopped. Local photos retained.')

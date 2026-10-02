#!/usr/bin/env python3
"""Ask your logged-in Sclshi app to record once. No GUI Terminal is opened."""
import fcntl
import json
import os
from pathlib import Path
import tempfile
import time
import uuid

ROOT = Path.home() / 'Pictures' / 'PhotoStream'


def main():
    os.umask(0o077)
    if not ROOT.exists():
        raise RuntimeError('Install and open Sclshi on this Mac first.')
    with (ROOT / 'video-client.lock').open('w') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError('Another recording request is still waiting.')
        try:
            ready = json.loads((ROOT / 'video-ready.json').read_text())
        except (OSError, ValueError):
            raise RuntimeError('Open the updated Sclshi app in your desktop session first.')
        if time.time() - ready.get('at', 0) > 8:
            raise RuntimeError('Sclshi is not responding. It must be running in an awake desktop session.')
        ident = str(uuid.uuid4())
        request = ROOT / 'video-request.json'
        # Atomic, exclusive submission: the app never sees a half-written request.
        fd, temporary = tempfile.mkstemp(prefix='.video-request-', dir=ROOT)
        try:
            with os.fdopen(fd, 'w') as stream:
                json.dump({'id': ident, 'operation': 'record10', 'at': time.time()}, stream)
            try:
                os.link(temporary, request)
            except FileExistsError:
                raise RuntimeError('A request is already pending. Wait a few seconds and try again.')
        finally:
            os.unlink(temporary)
        print('Request sent to Sclshi. Its menu bar will show Recording; no Terminal window opens.', flush=True)
        last = None
        for _ in range(150):
            try:
                result = json.loads((ROOT / 'video-result.json').read_text())
                if result.get('id') == ident:
                    if result.get('message') != last:
                        last = result.get('message'); print(last, flush=True)
                    if result.get('done'):
                        return 0 if result.get('ok') else 1
            except (OSError, ValueError):
                pass
            time.sleep(1)
        raise RuntimeError('Timed out waiting for Sclshi. Check its menu or ~/Pictures/PhotoStream/app-status.txt before sending another request.')


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (OSError, ValueError, RuntimeError) as error:
        print(str(error)); raise SystemExit(1)
    except KeyboardInterrupt:
        print('\nStopped waiting. Use Stop recording in Sclshi to cancel an active recording.')
        raise SystemExit(130)

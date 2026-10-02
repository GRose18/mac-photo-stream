#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
PYTHON="${SCLSHI_PYTHON:-python3}"
"$PYTHON" -c 'import sys; assert sys.version_info >= (3, 10), "Python 3.10 or newer is required"'
RUNTIME="$HOME/Library/Application Support/Sclshi/aiortc-venv"
"$PYTHON" -m venv "$RUNTIME"
"$RUNTIME/bin/python" -m pip install --only-binary=:all: -r ../requirements-aiortc.txt
"$RUNTIME/bin/python" -c 'import aiortc, aiohttp, av, certifi; print("aiortc runtime ready")'
echo 'Runtime installed. Launch Sclshi with --aiortc-test to test generated video.'

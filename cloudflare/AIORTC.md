# aiortc transport test in Sclshi

This opt-in mode streams a generated moving pattern, not your desktop. It proves
that the app, Cloudflare signaling, and browser can carry an actual WebRTC video
track. No screen-capture implementation is included in the Python sender, and no
microphone/audio track is created. Screen-capture permission and system indicators
remain applicable to the existing native screen-sharing mode.

## Install and launch

Use the updated app **and** updated website. Python 3.10+ is required; install a
current Python if needed. The setup script installs wheel packages in a dedicated
virtual environment; it does not change system Python or activate capture.

```bash
cd "$HOME/sclshi-source/cloudflare/menu-bar"
bash setup-aiortc.sh
pkill -x Sclshi || true
bash install.sh
open "$HOME/Applications/Sclshi.app" --args --aiortc-test
```

Open the website's admin **aiortc test** page at `/live?mode=aiortc-test`. It connects automatically, or click
**Connect** if previously disconnected. Expect a colored pattern with a moving
bright bar and the label **aiortc test pattern (not your screen)**. The two devices
must be directly reachable, usually on the same local network. Local-network
permission or firewall settings can affect connectivity. If macOS asks whether the
Python runtime may accept incoming network connections, allow it for this test. There is no STUN/TURN
relay, so this is not a promise of connectivity across arbitrary networks.

Only one source and viewer per channel are supported. The test channel is separate
from normal screen sharing; both share the same daily connection budget. The
existing saved upload configuration is used for source authentication; the viewer
still needs admin authentication. No credentials are embedded in URLs or logged.
The existing 30-minute sessions and connection budget remain in force. Reconnects
back off from one to five minutes. Authorization failures stop the sender.

During this test launch, Sclshi does not start its camera timers, service recording
requests, or register a login item. It runs the aiortc helper instead of native
screen capture. Existing login settings are not changed. Sleep/session inactivity
stops the helper; returning starts it again. Quitting Sclshi terminates the helper;
the helper also exits if its parent process disappears.

Diagnostics:

```bash
cat "$HOME/Pictures/PhotoStream/aiortc.log"
```

To leave test mode and return to the existing app behavior:

```bash
pkill -x Sclshi
open "$HOME/Applications/Sclshi.app"
```

The test flag applies to one launch only. Reopening normally or starting at login
uses the original native capture behavior. In test mode, Devices does not claim
that the Mac's actual desktop is being shared.

## Verification

```bash
node --test
"$HOME/Library/Application Support/Sclshi/aiortc-venv/bin/python" \
  -m unittest discover -s test -p test_aiortc_stream.py -v
bash menu-bar/build.sh
```

Run these from `cloudflare/`. Python tests negotiate two real local peers, receive a
640×360 generated frame, verify no audio offer, and check cleanup and replacement
of the peer. Browser tests cover video rendering and cleanup plus existing retry
behavior. Actual two-device browser playback is a separate acceptance test.

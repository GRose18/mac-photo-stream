# Live screen viewing

Sclshi 5 adds optional live viewing of the Mac's main display. No audio, video
recordings, or screen images are saved. Photo capture still runs every three minutes.

## Setup

1. Quit Sclshi, pull the current source, and run `bash install.sh` in `cloudflare/menu-bar`.
2. Open `~/Applications/Sclshi.app`. In its menu, enable **Share screen at login**
   and confirm. This opt-in is per Mac and is off for existing installations until enabled.
3. Allow Screen Recording (called Screen & System Audio Recording on some macOS
   versions) and local-network access when macOS requests it. Reopen Sclshi if asked.
   Operating-system permission renewals may still be required.
4. Confirm Sclshi is enabled in System Settings > General > Login Items.
5. On the viewing computer, sign in as admin at the gallery, select **Live screen**,
   then **Connect**. Both devices should be on the same local network.

The menu shows **Screen sharing** while available and **LIVE** while capturing for
an attached viewer. **Stop screen sharing** stops the current session. Uncheck
**Share screen at login** to disable automatic sharing on future launches.
Sleep and an inactive login session stop the connection; wake/return resumes it
only if sharing was active. Quit and logout stop sharing. No screen permission or
camera access is requested during build or test commands.

## Limits and behavior

- One sharing Mac and one admin viewer at a time. Other members cannot access live view.
- Main display only, up to 1280 pixels wide, approximately three JPEG frames per
  second. This is a lightweight screen view, not smooth video or remote control.
- Screen capture starts only after the authenticated viewer establishes a peer connection.
- WebRTC uses local host candidates, no STUN/TURN or paid video relay. Network
  client isolation, VPNs, firewalls or browser local-network restrictions may block it.
- Cloudflare exchanges offer/answer connection messages only. The screen frames
  travel over an encrypted peer data channel, never through Supabase/photo storage.
- Sessions expire after 30 minutes. The source reconnects after a minute; the viewer
  must click Connect again. This bounds authentication lifetime.
- A separate hibernating SQLite Durable Object has a 500-connection/day limit and
  a 160-message/session cap. It stores only the current day's connection counter;
  signaling attachments expire with the connection. Existing free-plan guards stay.
- Losing a connection clears the viewer image. A stalled image is cleared after five
  seconds rather than presented as a current screen. Keep the viewing tab open.

## Verification

`node --test` runs existing regression tests. After a Wrangler dry-run build,
`node live-smoke.mjs` tests anonymous/source/admin separation, origin checks,
exclusive roles, signaling exchange and rejection of screen-frame messages by
Cloudflare, using local synthetic data. `bash menu-bar/build.sh` compiles both Mac
architectures without launching capture. Actual permission prompts and a live
connection between two different Macs need a per-device acceptance check.

## Device status and native screen control (Sclshi 6)

The admin gallery's **Devices** tab lists Macs running Sclshi 6 or later. Each app
sends a small heartbeat approximately once per minute, independent of screen sharing.
The server stamps its receipt time, so an incorrect device clock cannot make a Mac
appear online forever. **Online** means a check-in within 150 seconds; **Offline /
asleep** means no recent check-in, not proof the computer is powered off. Closing
Sclshi also makes it appear offline, even if SSH still works. The visible tab refreshes
once a minute. Device status is not available to gallery members.

The app stores a persistent random ID in `~/Pictures/PhotoStream/device-id.txt` and
reports the Mac's computer name, app version, browser-sharing enabled state, and
Tailscale IPv4 address when the installed Tailscale CLI supplies one. No usernames,
passwords, screen frames, or location history are included. The address is checked
at most every five minutes. If it is missing initially, allow another check-in.
Latest diagnostic: `cat ~/Pictures/PhotoStream/device-status.txt`.

**Control Mac** opens a `vnc://100.x.x.x` link in the viewing Mac's built-in Screen
Sharing app. This is native mouse/keyboard control over Tailscale, separate from the
browser's view-only WebRTC page. Screen Sharing must be enabled on the target Mac:

1. System Settings → General → Sharing → Screen Sharing.
2. Enable the service and allow only your Mac user account.
3. Keep Tailscale connected on both computers.
4. In the gallery, open Devices → Control Mac. Approve your browser's request to
   open Screen Sharing, if shown, and authenticate with the target Mac's credentials.

Use **Copy address** and paste into Screen Sharing or Finder's Connect to Server
if the browser doesn't open the link. A manual Terminal equivalent on the viewing
Mac is `open 'vnc://YOUR_TAILSCALE_IP'`. No Mac credentials are stored by the website.
This requires a viewing Mac; it is not an in-browser control feature.

Normal macOS sharing indicators and permissions remain. Close the Screen Sharing
connection window to disconnect. Turn the target Mac's Screen Sharing service off
to disable native access. Sclshi's Stop screen sharing menu controls only its own
browser stream. No power/sleep settings are changed, and no remote service is
silently enabled by installing Sclshi. The target still must be awake and reachable.

Presence is capped at 10 registered devices and 16,000 accepted updates/day globally.
Repeated updates within 45 seconds are coalesced without writes. Only each device's
latest state and one daily budget counter are stored in the existing LiveRoom object.
Native control traffic travels through Tailscale, not Cloudflare or Supabase.

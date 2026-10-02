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

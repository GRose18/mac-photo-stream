#!/usr/bin/env python3
"""Prepare the documented Sclshi source for a visible, locally approved launch.
Does not build, install, launch, record, or contact a server.
"""
import argparse
import hashlib
from pathlib import Path

EXPECTED_SHA256 = 'b69dd150bfd645e4b797ba3c01d6c5186bb2ee146d3c910843a7955df1d2708b'
MARKER = '// Visible Sclshi documentation build: local consent required.'

def prepare(path):
    original = path.read_text()
    if MARKER in original:
        print('Already prepared. No changes made.')
        return
    if hashlib.sha256(original.encode()).hexdigest() != EXPECTED_SHA256:
        raise SystemExit('Source differs from the documented revision. No changes made. Use commit 9bd77b8 in a separate checkout.')
    updated = original
    def replace(old, new):
        nonlocal updated
        if updated.count(old) != 1:
            raise SystemExit('Unexpected source layout. No changes made.')
        updated = updated.replace(old, new, 1)
    replace('import Cocoa', MARKER + '\nimport Cocoa')
    replace('status.menu = nil', 'status.menu = menu')
    replace('status.isVisible = false', 'status.isVisible = true')
    replace('_ = item("", #selector(quit), menu)', '_ = item("Quit Sclshi", #selector(quit), menu)')
    replace('self?.screenToggle.title = enabled ? "" : ""', 'self?.screenToggle.title = enabled ? "Stop screen sharing" : "Start screen sharing"')
    replace('self.status.button?.toolTip = nil', 'self.status.button?.toolTip = text')
    replace('status.button?.title = "$"\n    }', 'status.button?.title = video == nil ? "$" : "Recording"\n    }')
    replace('if !paused { screenShare.start() }', '// Screen sharing starts only from the visible Start screen sharing control.')
    replace('if !aiortcTest && !UserDefaults.standard.bool(forKey: "loginOff") { enableLogin() }', '// Login startup is optional and managed explicitly in System Settings.')
    replace('if !preview && !paused { resumeScreenAfterWake = false; screenShare?.start() }', 'if !preview && !paused && resumeScreenAfterWake { resumeScreenAfterWake = false; screenShare?.start() }')
    replace('screenAuto.state = UserDefaults.standard.bool(forKey:"screenAuto") ? .on : .off', 'screenAuto.isHidden = true // This build never starts screen sharing at login.')
    replace('if preview { report("Preview — camera and uploads disabled"); return }', '''if preview { report("Preview — camera and uploads disabled"); return }
        NSApp.activate(ignoringOtherApps: true)
        let consent = NSAlert()
        consent.messageText = "Start Sclshi photo capture?"
        consent.informativeText = "This takes a camera photo now and every 3 minutes while running and awake, and uploads it to your configured gallery. Local originals are retained. The visible $ menu includes Quit Sclshi to stop all capture. Screen sharing stays off until you start it yourself."
        consent.addButton(withTitle: "Start photos")
        consent.addButton(withTitle: "Cancel")
        guard consent.runModal() == .alertFirstButtonReturn else { NSApp.terminate(nil); return }''')
    start = updated.index('    func configure() {')
    end = updated.index('    @objc func toggleScreen()', start)
    updated = updated[:start] + '''    func configure() {
        let alert = NSAlert()
        alert.messageText = "Configure your own gallery first"
        alert.informativeText = "Run photo_upload.py --setup as described in the Sclshi guide. Enter your own HTTPS gallery URL and upload token. Then reopen Sclshi."
        alert.addButton(withTitle: "OK")
        alert.runModal()
        paused = true
    }
''' + updated[end:]
    backup = path.with_suffix('.swift.before-visible-guide')
    if backup.exists():
        raise SystemExit('Backup already exists. No changes made; inspect it before continuing.')
    backup.write_text(original)
    path.write_text(updated)
    print('Prepared visible controls and startup confirmation. Original source saved beside the file.')

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source_folder', type=Path, help='The sclshi-source repository folder')
    args = parser.parse_args()
    prepare(args.source_folder.expanduser() / 'cloudflare/menu-bar/PhotoStream.swift')

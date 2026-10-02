import Cocoa
import AVFoundation
import ServiceManagement
import ImageIO
import CryptoKit
import Darwin

@main
final class PhotoStream: NSObject, NSApplicationDelegate, AVCapturePhotoCaptureDelegate {
    static func main() {
        let app = NSApplication.shared
        let delegate = PhotoStream()
        app.delegate = delegate
        app.setActivationPolicy(.accessory)
        withExtendedLifetime(delegate) { app.run() }
    }
    let root = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Pictures/PhotoStream")
    let queue = DispatchQueue(label: "com.gaberose.photostream.capture")
    let preview = CommandLine.arguments.contains("--preview") || Bundle.main.object(forInfoDictionaryKey: "PhotoStreamPreview") as? Bool == true
    var status: NSStatusItem!
    var timer: Timer?
    var session: AVCaptureSession?
    var output: AVCapturePhotoOutput?
    var task: Process?
    var paused = false
    var busy = false
    var lockFD: Int32 = -1
    var activeCapture: UUID?
    var presence: DevicePresence?
    var screenShare: ScreenShare!
    var screenStatus: NSMenuItem!
    var screenToggle: NSMenuItem!
    var screenAuto: NSMenuItem!
    var videoTimer: Timer?
    var video: CameraVideo?
    var videoLabel: NSMenuItem!
    var videoStop: NSMenuItem!
    var videoRequestID: String?
    var desktopActive = true
    var resumeScreenAfterWake = false

    func report(_ text: String) {
        DispatchQueue.main.async { self.status.button?.toolTip = "Sclshi · photo capture every 3 minutes · \(text)" }
        guard !preview else { return }
        try? "\(Date()): \(text)\n".write(to: root.appendingPathComponent("app-status.txt"), atomically: true, encoding: .utf8)
    }
    func item(_ title: String, _ action: Selector?, _ menu: NSMenu) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: action, keyEquivalent: "")
        item.target = self; menu.addItem(item); return item
    }
    func applicationDidFinishLaunching(_ notification: Notification) {
        umask(0o077)
        if !preview {
            try? FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
            lockFD = open(root.appendingPathComponent("menu-app.lock").path, O_CREAT | O_RDWR, 0o600)
            guard lockFD >= 0, flock(lockFD, LOCK_EX | LOCK_NB) == 0 else { NSApp.terminate(nil); return }
        }
        paused = preview
        status = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        status.button?.title = "$"
        status.button?.setAccessibilityLabel("Sclshi photo capture")
        let menu = NSMenu()
        videoLabel = item("Video ready · SSH requests enabled", nil, menu)
        videoStop = item("Stop recording", #selector(stopVideo), menu); videoStop.isHidden = true
        menu.addItem(.separator())
        screenStatus = item("Screen sharing off", nil, menu)
        screenToggle = item("Start screen sharing", #selector(toggleScreen), menu)
        screenAuto = item("Share screen at login", #selector(toggleScreenAuto), menu)
        screenAuto.state = UserDefaults.standard.bool(forKey:"screenAuto") ? .on : .off
        menu.addItem(.separator())
        _ = item("Quit", #selector(quit), menu)
        status.menu = menu
        if preview { report("Preview — camera and uploads disabled"); return }
        screenShare = ScreenShare(root:root)
        screenShare.onStatus = { [weak self] text, enabled in
            self?.screenStatus.title = text
            self?.screenToggle.title = enabled ? "Stop screen sharing" : "Start screen sharing"
            self?.refreshTitle()
        }
        NSWorkspace.shared.notificationCenter.addObserver(self, selector:#selector(screenSleep), name:NSWorkspace.willSleepNotification, object:nil)
        NSWorkspace.shared.notificationCenter.addObserver(self, selector:#selector(screenWake), name:NSWorkspace.didWakeNotification, object:nil)
        NSWorkspace.shared.notificationCenter.addObserver(self, selector:#selector(screenSleep), name:NSWorkspace.sessionDidResignActiveNotification, object:nil)
        NSWorkspace.shared.notificationCenter.addObserver(self, selector:#selector(screenWake), name:NSWorkspace.sessionDidBecomeActiveNotification, object:nil)
        if !FileManager.default.fileExists(atPath: root.appendingPathComponent("config.json").path) { configure() }
        presence = DevicePresence(root:root)
        presence?.sharing = { [weak self] in self?.screenShare.enabled == true }
        presence?.start()
        if UserDefaults.standard.bool(forKey:"screenAuto") { screenShare.start() }
        if !UserDefaults.standard.bool(forKey: "loginOff") { enableLogin() }
        videoTimer = Timer.scheduledTimer(timeInterval: 2, target: self, selector: #selector(checkVideoRequest), userInfo: nil, repeats: true)
        checkVideoRequest()
        timer = Timer.scheduledTimer(timeInterval: 180, target: self, selector: #selector(tick), userInfo: nil, repeats: true)
        if paused { report("Setup incomplete — quit and reopen to enter your token") } else { tick() }
    }
    func configure() {
        NSApp.activate(ignoringOtherApps: true)
        let alert = NSAlert()
        alert.messageText = "Connect Sclshi"
        alert.informativeText = "Enter your upload token once. Photos are captured every 3 minutes while running and awake. Use the $ menu-bar icon to quit. Sclshi also starts at login."
        let field = NSSecureTextField(frame: NSRect(x: 0, y: 0, width: 360, height: 24))
        alert.accessoryView = field; alert.addButton(withTitle: "Save"); alert.addButton(withTitle: "Cancel")
        if alert.runModal() == .alertFirstButtonReturn && !field.stringValue.isEmpty {
            let config = ["url": "https://mac-photo-stream.photo-stream-cloudflare-draft.workers.dev", "token": field.stringValue]
            do { try JSONSerialization.data(withJSONObject: config).write(to: root.appendingPathComponent("config.json"), options: .atomic) }
            catch { report("Could not save configuration"); paused = true }
        } else { paused = true }
    }
    @objc func toggleScreen() {
        guard !preview else { return }
        if screenShare.enabled { resumeScreenAfterWake = false; screenShare.stop() }
        else { screenShare.start() }
    }
    @objc func toggleScreenAuto() {
        guard !preview else { return }
        let enabled = !UserDefaults.standard.bool(forKey:"screenAuto")
        if enabled {
            let alert = NSAlert(); alert.messageText = "Share this screen at login?"
            alert.informativeText = "Sclshi will make this Mac’s main display available to your gallery admin whenever you log in. Screen images are sent only while an admin is connected. No audio or recordings are saved. A visible Screen sharing menu includes Stop."
            alert.addButton(withTitle:"Enable"); alert.addButton(withTitle:"Cancel")
            guard alert.runModal() == .alertFirstButtonReturn else { return }
        }
        UserDefaults.standard.set(enabled, forKey:"screenAuto"); screenAuto.state = enabled ? .on : .off
        if enabled { screenShare.start() }
    }
    @objc func screenSleep() {
        desktopActive = false; video?.cancel()
        if screenShare?.enabled == true { resumeScreenAfterWake = true; screenShare.stop() }
    }
    @objc func screenWake() {
        desktopActive = true
        presence?.beat()
        if resumeScreenAfterWake { resumeScreenAfterWake = false; screenShare?.start() }
    }
    func enableLogin() {
        do { try SMAppService.mainApp.register() } catch { report("Login setup needs attention in System Settings") }
    }
    @objc func quit() { NSApp.terminate(nil) }
    func finish(_ text: String) {
        session?.stopRunning(); session = nil; output = nil; activeCapture = nil
        report(text); DispatchQueue.main.async { self.busy = false }
    }
    @objc func tick() {
        guard !preview && !paused && !busy && desktopActive else { return }
        guard FileManager.default.fileExists(atPath: root.appendingPathComponent("config.json").path) else { configure(); return }
        busy = true
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { granted in
                DispatchQueue.main.async { self.busy = false; if granted { self.tick() } else { self.report("Camera denied — open Camera Settings") } }
            }
        case .authorized: queue.async { self.capture() }
        default: busy = false; report("Allow Sclshi in System Settings > Privacy & Security > Camera")
        }
    }
    func capture() {
        do {
            let disk = try FileManager.default.attributesOfFileSystem(forPath: root.path)
            var used: Int64 = 0
            if let files = FileManager.default.enumerator(at: root, includingPropertiesForKeys: [.fileSizeKey, .isRegularFileKey]) {
                for case let file as URL in files {
                    let v = try file.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey])
                    if v.isRegularFile == true { used += Int64(v.fileSize ?? 0) }
                }
            }
            let free = (disk[.systemFreeSize] as? NSNumber)?.int64Value ?? 0
            if used >= 2_000_000_000 || free < 1_000_000_000 {
                report("Local storage limit — capture paused"); upload(); return
            }
            guard let camera = AVCaptureDevice.default(for: .video) else { finish("No camera available"); return }
            let input = try AVCaptureDeviceInput(device: camera)
            let session = AVCaptureSession(); let output = AVCapturePhotoOutput()
            session.sessionPreset = .photo
            guard session.canAddInput(input), session.canAddOutput(output) else { finish("Camera unavailable or in use"); return }
            session.addInput(input); session.addOutput(output)
            self.session = session; self.output = output
            let captureID = UUID(); activeCapture = captureID
            session.startRunning(); report("Taking a photo…")
            queue.asyncAfter(deadline: .now() + 30) {
                if self.activeCapture == captureID { self.finish("Camera timed out — retrying at the next scheduled capture") }
            }
            queue.asyncAfter(deadline: .now() + 2) {
                guard self.activeCapture == captureID else { return }
                guard session.isRunning else { self.finish("Camera did not start"); return }
                output.capturePhoto(with: AVCapturePhotoSettings(format: [AVVideoCodecKey: AVVideoCodecType.jpeg]), delegate: self)
            }
        } catch { finish("Capture failed: \(error.localizedDescription)") }
    }
    func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
        let original = photo.fileDataRepresentation()
        queue.async {
            guard self.output === output, self.activeCapture != nil else { return }
            self.activeCapture = nil
            self.session?.stopRunning(); self.session = nil; self.output = nil
            guard error == nil, let original = original else { self.finish("Capture failed; existing photos retained"); return }
            do {
                let id = UUID().uuidString.lowercased()
                let folder = self.root.appendingPathComponent("pending/\(id)")
                try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
                try original.write(to: folder.appendingPathComponent("original.jpg"), options: .atomic)
                guard let source = CGImageSourceCreateWithData(original as CFData, nil),
                      let thumb = CGImageSourceCreateThumbnailAtIndex(source, 0, [kCGImageSourceCreateThumbnailFromImageAlways: true, kCGImageSourceThumbnailMaxPixelSize: 1024, kCGImageSourceCreateThumbnailWithTransform: true] as CFDictionary),
                      let jpeg = NSBitmapImageRep(cgImage: thumb).representation(using: .jpeg, properties: [.compressionFactor: 0.55]), jpeg.count <= 1_000_000 else { self.finish("JPEG conversion failed; original retained"); return }
                try jpeg.write(to: folder.appendingPathComponent("upload.jpg"), options: .atomic)
                let hash = SHA256.hash(data: jpeg).map { String(format: "%02x", $0) }.joined()
                let receipt = ["id": id, "sha256": hash, "captured_at": ISO8601DateFormatter().string(from: Date())]
                try JSONSerialization.data(withJSONObject: receipt).write(to: folder.appendingPathComponent("receipt.json"), options: .atomic)
                self.upload()
            } catch { self.finish("Save failed: \(error.localizedDescription)") }
        }
    }
    func upload() {
        let candidates = ["/opt/homebrew/bin/python3", "/usr/local/bin/python3", "/Library/Frameworks/Python.framework/Versions/Current/bin/python3", "/usr/bin/python3"]
        guard let python = candidates.first(where: { FileManager.default.isExecutableFile(atPath: $0) }), let script = Bundle.main.path(forResource: "photo_upload", ofType: "py") else { finish("Python 3 missing — photos retained"); return }
        let p = Process(); p.executableURL = URL(fileURLWithPath: python)
        p.arguments = ["-u", script, "--retry-only", "--root", root.path]
        let pipe = Pipe(); p.standardOutput = pipe; p.standardError = pipe; task = p
        do {
            try p.run(); let data = pipe.fileHandleForReading.readDataToEndOfFile(); p.waitUntilExit()
            let text = String(data: data, encoding: .utf8) ?? ""
            if text.contains("Upload verified") { finish("Uploaded ✓ — waiting for the next scheduled capture") }
            else if text.contains("HTTP 507") { finish("Cloud storage full — photo retained locally") }
            else if text.contains("HTTP 429") { finish("Daily limit reached — photo retained locally") }
            else if p.terminationStatus != 0 { finish("Upload failed — photo retained for retry") }
            else { finish("Photo saved — waiting to retry upload") }
        } catch { finish("Uploader failed to start; photos retained") }
        task = nil
    }
    func refreshTitle() {
        if video != nil { status.button?.title = "$ · Recording" }
        else if videoRequestID != nil { status.button?.title = "$ · Video upload" }
        else { status.button?.title = screenShare?.enabled == true ? "$ · Screen sharing" : "$" }
    }
    func videoResult(_ id: String, _ message: String, done: Bool, ok: Bool = false) {
        let value: [String: Any] = ["id": id, "message": message, "done": done, "ok": ok]
        if let data = try? JSONSerialization.data(withJSONObject: value) {
            try? data.write(to: root.appendingPathComponent("video-result.json"), options: .atomic)
        }
    }
    @objc func stopVideo() { video?.cancel() }
    @objc func checkVideoRequest() {
        guard !preview else { return }
        if desktopActive, let ready = try? JSONSerialization.data(withJSONObject: ["at": Date().timeIntervalSince1970]) {
            try? ready.write(to: root.appendingPathComponent("video-ready.json"), options: .atomic)
        }
        let request = root.appendingPathComponent("video-request.json")
        guard FileManager.default.fileExists(atPath: request.path) else { return }
        // Same-user, local command only. Reject links and oversized input; never execute request text.
        defer { try? FileManager.default.removeItem(at: request) }
        guard let attr = try? FileManager.default.attributesOfItem(atPath: request.path),
              attr[.type] as? FileAttributeType == .typeRegular,
              (attr[.ownerAccountID] as? NSNumber)?.uint32Value == getuid(),
              (attr[.size] as? NSNumber)?.intValue ?? 2048 <= 1024,
              let data = try? Data(contentsOf: request),
              let value = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let id = value["id"] as? String, UUID(uuidString: id) != nil else { return }
        guard value["operation"] as? String == "record10", let at = value["at"] as? Double,
              abs(Date().timeIntervalSince1970 - at) < 30 else {
            videoResult(id, "Expired or invalid request; no recording started", done: true); return
        }
        guard desktopActive && !paused && !busy else {
            videoResult(id, "Sclshi is busy or the desktop is inactive. Try again when ready.", done: true); return
        }
        guard AVCaptureDevice.authorizationStatus(for: .video) == .authorized else {
            videoResult(id, "Allow Sclshi camera access on this Mac’s desktop first.", done: true); return
        }
        busy = true; videoRequestID = id
        videoResult(id, "Preparing camera…", done: false)
        queue.async {
            do {
                let disk = try FileManager.default.attributesOfFileSystem(forPath: self.root.path)
                var used: Int64 = 0
                if let files = FileManager.default.enumerator(at: self.root, includingPropertiesForKeys: [.fileSizeKey, .isRegularFileKey]) {
                    for case let file as URL in files {
                        let v = try file.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey])
                        if v.isRegularFile == true { used += Int64(v.fileSize ?? 0) }
                    }
                }
                guard used < 2_000_000_000, (disk[.systemFreeSize] as? NSNumber)?.int64Value ?? 0 >= 1_000_000_000 else {
                    DispatchQueue.main.async { self.endVideo(id, "Local storage safety limit reached", ok: false) }; return
                }
                let folder = self.root.appendingPathComponent("videos/raw")
                try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
                let url = folder.appendingPathComponent(id + ".mov")
                DispatchQueue.main.async {
                    guard self.desktopActive else { self.endVideo(id, "Desktop inactive; recording cancelled", ok: false); return }
                    let video = CameraVideo(); self.video = video
                    self.videoLabel.title = "Starting 10-second recording…"; self.videoStop.isHidden = false; self.refreshTitle()
                    video.onStatus = { [weak self, weak video] text in
                        guard let self = self, self.video === video else { return }
                        self.videoLabel.title = text; self.report(text); self.videoResult(id, text, done: false)
                    }
                    video.onFinish = { [weak self] url, message in
                        guard let self = self else { return }
                        self.video = nil; self.videoStop.isHidden = true; self.refreshTitle()
                        guard let url = url else { self.endVideo(id, message, ok: false); return }
                        self.videoLabel.title = message; self.videoResult(id, message, done: false)
                        self.queue.async { self.uploadVideo(url, id: id) }
                    }
                    video.start(at: url)
                }
            } catch { DispatchQueue.main.async { self.endVideo(id, "Video setup failed: \(error.localizedDescription)", ok: false) } }
        }
    }
    func endVideo(_ id: String, _ message: String, ok: Bool) {
        video = nil; videoRequestID = nil; busy = false
        videoStop.isHidden = true; videoLabel.title = message; refreshTitle()
        report(message); videoResult(id, message, done: true, ok: ok)
    }
    func uploadVideo(_ url: URL, id: String) {
        let candidates = ["/opt/homebrew/bin/python3", "/usr/local/bin/python3", "/Library/Frameworks/Python.framework/Versions/Current/bin/python3", "/usr/bin/python3"]
        guard let python = candidates.first(where: { FileManager.default.isExecutableFile(atPath: $0) }),
              let script = Bundle.main.path(forResource: "video_upload", ofType: "py") else {
            DispatchQueue.main.async { self.endVideo(id, "Uploader missing; recording retained locally", ok: false) }; return
        }
        let p = Process(); p.executableURL = URL(fileURLWithPath: python)
        p.arguments = ["-u", script, "--file", url.path]
        let pipe = Pipe(); p.standardOutput = pipe; p.standardError = pipe; task = p
        do {
            try p.run(); let data = pipe.fileHandleForReading.readDataToEndOfFile(); p.waitUntilExit()
            let text = String(data: data, encoding: .utf8) ?? ""
            try? text.write(to: root.appendingPathComponent("video-upload.log"), atomically: true, encoding: .utf8)
            let success = p.terminationStatus == 0 && text.contains("Upload verified")
            let message = success ? "Video uploaded; local backup retained" : "Video retained locally; check video-upload.log for retry instructions"
            DispatchQueue.main.async { self.endVideo(id, message, ok: success) }
        } catch { DispatchQueue.main.async { self.endVideo(id, "Uploader failed; video retained locally", ok: false) } }
        task = nil
    }
    func applicationWillTerminate(_ notification: Notification) {
        videoTimer?.invalidate(); video?.cancel()
        try? FileManager.default.removeItem(at: root.appendingPathComponent("video-ready.json"))
        presence?.stop()
        screenShare?.stop()
        timer?.invalidate(); if task?.isRunning == true { task?.terminate() }; session?.stopRunning()
        if lockFD >= 0 { close(lockFD) }
    }
}

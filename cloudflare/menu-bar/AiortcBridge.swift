import Cocoa

/// Optional transport test: generated video only, with no screen/camera capture.
final class AiortcBridge {
    private var process: Process?
    private var log: FileHandle?
    var onStatus: (String, Bool) -> Void = { _, _ in }

    func start(root: URL) {
        guard process == nil else { return }
        let python = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Application Support/Sclshi/aiortc-venv/bin/python")
        guard FileManager.default.isExecutableFile(atPath: python.path),
              let script = Bundle.main.path(forResource: "aiortc_stream", ofType: "py") else {
            onStatus("aiortc runtime missing — run setup-aiortc.sh", false)
            return
        }
        let logURL = root.appendingPathComponent("aiortc.log")
        FileManager.default.createFile(atPath: logURL.path, contents: nil, attributes: [.posixPermissions: 0o600])
        do {
            log = try FileHandle(forWritingTo: logURL)
            let task = Process()
            task.executableURL = python
            task.arguments = [script, "--root", root.path, "--parent-pid", String(getpid())]
            task.standardOutput = log; task.standardError = log
            task.terminationHandler = { [weak self] ended in
                DispatchQueue.main.async {
                    guard let self = self, self.process === ended else { return }
                    self.process = nil
                    try? self.log?.close(); self.log = nil
                    self.onStatus("aiortc stopped — check aiortc.log", false)
                }
            }
            process = task
            try task.run()
            onStatus("aiortc test video ready", true)
        } catch {
            process = nil; try? log?.close(); log = nil
            onStatus("aiortc could not start — check runtime", false)
        }
    }

    func stop() {
        let task = process; process = nil
        if task?.isRunning == true { task?.terminate() }
        try? log?.close(); log = nil
    }
}

import Cocoa

// One small authenticated heartbeat per minute. No screen contents or location data.
final class DevicePresence {
    private let root: URL
    private var timer: Timer?
    private var task: URLSessionDataTask?
    private var active = false
    private var tailscaleIP: String?
    private var tailscaleChecked = Date.distantPast
    private var checkingIP = false
    var sharing: () -> Bool = { false }
    init(root: URL) { self.root = root }
    func start() {
        active = true
        timer = Timer.scheduledTimer(withTimeInterval:60,repeats:true) { [weak self] _ in self?.beat() }
        timer?.tolerance = 5
        beat()
    }
    func stop() { active = false; timer?.invalidate(); timer = nil; task?.cancel(); task = nil }
    func beat() {
        guard active, task == nil else { return }
        updateTailscaleIP()
        do {
            let config = try JSONSerialization.jsonObject(with:Data(contentsOf:root.appendingPathComponent("config.json"))) as? [String:String]
            guard let base = config?["url"], let token = config?["token"], !token.isEmpty,
                  let url = URL(string:base), url.scheme == "https", url.host != nil else { return }
            let file = root.appendingPathComponent("device-id.txt")
            let old = try? String(contentsOf:file,encoding:.utf8).trimmingCharacters(in:.whitespacesAndNewlines)
            let id: String
            if let old = old, UUID(uuidString:old) != nil { id = old.lowercased() }
            else { id = UUID().uuidString.lowercased(); try id.write(to:file,atomically:true,encoding:.utf8) }
            let body: [String:Any] = ["id":id,"name":String((Host.current().localizedName ?? "Mac").prefix(80)),"sharing":sharing(),"tailscaleIP":tailscaleIP as Any? ?? NSNull(),"version":Bundle.main.object(forInfoDictionaryKey:"CFBundleShortVersionString") as? String ?? "6.0"]
            var request = URLRequest(url:url.appendingPathComponent("api/devices/heartbeat"));request.httpMethod="POST";request.timeoutInterval=15
            request.setValue("Bearer " + token,forHTTPHeaderField:"Authorization");request.setValue("application/json",forHTTPHeaderField:"Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject:body)
            task = URLSession.shared.dataTask(with:request) { [weak self] _,response,error in DispatchQueue.main.async {
                guard let self = self else { return }; self.task = nil
                guard self.active else { return }
                let status = (response as? HTTPURLResponse)?.statusCode ?? 0
                let text = status==204 ? "Device check-in confirmed" : "Device check-in failed (HTTP \(status)); retrying next minute"
                try? "\(Date()): \(text)\n".write(to:self.root.appendingPathComponent("device-status.txt"),atomically:true,encoding:.utf8)
            } }
            task?.resume()
        } catch { /* Existing photo configuration may not be complete yet. */ }
    }
    private func updateTailscaleIP() {
        guard !checkingIP, Date().timeIntervalSince(tailscaleChecked)>300 else { return }
        tailscaleChecked = Date();checkingIP = true
        DispatchQueue.global(qos:.utility).async { [weak self] in
            let paths = ["/Applications/Tailscale.app/Contents/MacOS/Tailscale","/usr/local/bin/tailscale","/opt/homebrew/bin/tailscale"]
            var ip: String?
            if let path = paths.first(where:{FileManager.default.isExecutableFile(atPath:$0)}) {
                let p = Process();p.executableURL=URL(fileURLWithPath:path);p.arguments=["ip","-4"]
                var env = ProcessInfo.processInfo.environment;env["TERM"]="dumb";env["SHLVL"]="1";p.environment=env
                let pipe = Pipe();p.standardOutput=pipe;p.standardError=FileHandle.nullDevice
                do {
                    try p.run()
                    let end=Date().addingTimeInterval(5)
                    while p.isRunning && Date()<end { Thread.sleep(forTimeInterval:0.05) }
                    if p.isRunning { p.terminate() }
                    else { let text=String(data:pipe.fileHandleForReading.readDataToEndOfFile(),encoding:.utf8)?.trimmingCharacters(in:.whitespacesAndNewlines) ?? ""
                        let parts=text.split(separator:".").compactMap{Int($0)}
                        if parts.count==4 && parts[0]==100 && (64...127).contains(parts[1]) && parts.allSatisfy({(0...255).contains($0)}) { ip=text }
                    }
                } catch {}
            }
            let result = ip
            DispatchQueue.main.async { self?.tailscaleIP=result;self?.checkingIP=false }
        }
    }
}

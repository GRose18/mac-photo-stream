import Cocoa
import ScreenCaptureKit
import WebKit
import CoreImage

// Frames remain in memory and travel only over the local WebRTC data channel.
final class ScreenShare: NSObject, WKScriptMessageHandler, WKNavigationDelegate, SCStreamOutput, SCStreamDelegate {
    var onStatus: (String, Bool) -> Void = { _,_ in }
    var enabled = false
    private var viewing = false
    private var web: WKWebView?
    private var socket: URLSessionWebSocketTask?
    private var stream: SCStream?
    private var reconnect: DispatchWorkItem?
    private var generation = UUID()
    private var starting = false
    private let queue = DispatchQueue(label: "com.gaberose.sclshi.screen")
    private let ci = CIContext()
    private let gate = DispatchSemaphore(value: 1)
    private var root: URL
    private let aiortcTest: Bool
    private var aiortc: AiortcBridge?
    init(root: URL, aiortcTest: Bool = false) {
        self.root = root; self.aiortcTest = aiortcTest; super.init()
    }
    func start() {
        guard !enabled else { return }
        if aiortcTest {
            let bridge = AiortcBridge(); aiortc = bridge
            bridge.onStatus = { [weak self] text, active in
                self?.enabled = active; self?.onStatus(text, active)
            }
            bridge.start(root: root)
            return
        }
        guard CGPreflightScreenCaptureAccess() else {
            CGRequestScreenCaptureAccess()
            onStatus("Screen permission needed — reopen after allowing", false); return
        }
        enabled = true; generation = UUID()
        onStatus("Screen sharing ready", true)
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        config.userContentController.add(self, name: "live")
        let web = WKWebView(frame: NSRect(x:0,y:0,width:1,height:1), configuration: config)
        self.web = web; web.navigationDelegate = self
        guard let file = Bundle.main.url(forResource: "screen-peer", withExtension: "html") else { stop(); return }
        web.loadFileURL(file, allowingReadAccessTo: file.deletingLastPathComponent())
    }
    func stop() {
        aiortc?.stop(); aiortc = nil
        enabled = false; viewing = false; generation = UUID(); starting = false
        reconnect?.cancel(); reconnect = nil
        socket?.cancel(with: .normalClosure, reason: nil); socket = nil
        stopCapture()
        web?.evaluateJavaScript("window.stop && window.stop()")
        web?.configuration.userContentController.removeScriptMessageHandler(forName: "live")
        web?.stopLoading(); web = nil
        onStatus("Screen sharing off", false)
    }
    private func connect() {
        guard enabled else { return }
        do {
            let data = try Data(contentsOf: root.appendingPathComponent("config.json"))
            guard let config = try JSONSerialization.jsonObject(with: data) as? [String:String],
                  let token = config["token"], !token.isEmpty,
                  let base = config["url"], let u = URL(string: base), u.scheme == "https", let host = u.host else { throw NSError(domain:"config",code:1) }
            var parts = URLComponents(); parts.scheme = "wss"; parts.host = host; parts.port = u.port; parts.path = "/api/live/source"
            var request = URLRequest(url: parts.url!); request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
            let task = URLSession.shared.webSocketTask(with: request); socket = task; task.resume(); receive(task)
        } catch { onStatus("Screen sharing needs upload configuration", true) }
    }
    private func receive(_ task: URLSessionWebSocketTask) {
        task.receive { [weak self] result in DispatchQueue.main.async {
            guard let self = self, self.enabled, self.socket === task else { return }
            switch result {
            case .success(let message):
                if case .string(let text) = message, text.utf8.count <= 20000,
                   let data = text.data(using:.utf8), let value = try? JSONSerialization.jsonObject(with:data) {
                    self.web?.callAsyncJavaScript("await window.signal(message)", arguments:["message":value], in:nil, in:.page) { _ in }
                }
                self.receive(task)
            case .failure:
                self.viewing = false; self.stopCapture(); self.web?.evaluateJavaScript("window.stop && window.stop()")
                self.onStatus("Screen sharing reconnecting", true)
                self.socket = nil
                let work = DispatchWorkItem { [weak self] in self?.connect() }; self.reconnect = work
                DispatchQueue.main.asyncAfter(deadline:.now()+60,execute:work)
            }
        } }
    }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard enabled, message.frameInfo.isMainFrame, let body = message.body as? [String:Any], let type = body["type"] as? String else { return }
        if type == "ready" { connect() }
        if type == "signal", let value = body["value"], let data = try? JSONSerialization.data(withJSONObject:value), let text = String(data:data,encoding:.utf8) {
            socket?.send(.string(text)) { _ in }
        }
        if type == "viewing", let value = body["value"] as? Bool {
            viewing = value
            if value { beginCapture() } else { stopCapture(); onStatus("Screen sharing ready", true) }
        }
        if type == "error" { onStatus("Screen sharing connection failed", true) }
    }
    private func beginCapture() {
        guard enabled, viewing, stream == nil, !starting else { return }
        starting = true; let current = generation
        Task { @MainActor in
            do {
                let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly:true)
                guard enabled, viewing, current == generation else { starting = false; return }
                guard let display = content.displays.first(where: { $0.displayID == CGMainDisplayID() }) ?? content.displays.first else { throw NSError(domain:"display",code:1) }
                let filter = SCContentFilter(display:display,excludingWindows:[])
                let settings = SCStreamConfiguration()
                settings.width = min(1280,display.width); settings.height = max(1,settings.width * display.height / max(1,display.width))
                settings.minimumFrameInterval = CMTime(value:1,timescale:3)
                settings.queueDepth = 3; settings.capturesAudio = false; settings.showsCursor = true
                let capture = SCStream(filter:filter,configuration:settings,delegate:self)
                try capture.addStreamOutput(self,type:.screen,sampleHandlerQueue:queue)
                stream = capture
                try await capture.startCapture()
                guard enabled, viewing, current == generation, stream === capture else { try? await capture.stopCapture(); return }
                starting = false; onStatus("Screen sharing LIVE", true)
            } catch {
                guard enabled, current == generation else { return }
                starting = false; stopCapture(); onStatus("Screen sharing failed — check permission", true)
            }
        }
    }
    private func stopCapture() {
        let capture = stream; stream = nil
        if let capture = capture { Task { try? await capture.stopCapture() } }
    }
    func stream(_ stream: SCStream, didStopWithError error: Error) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self, self.stream === stream else { return }
            self.stream = nil; self.onStatus("Screen sharing stopped — restart sharing", self.enabled)
        }
    }
    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .screen, sampleBuffer.isValid, let pixel = sampleBuffer.imageBuffer,
              gate.wait(timeout:.now()) == .success else { return }
        let image = CIImage(cvPixelBuffer:pixel)
        guard let jpeg = ci.jpegRepresentation(of:image,colorSpace:CGColorSpaceCreateDeviceRGB(),options:[kCGImageDestinationLossyCompressionQuality as CIImageRepresentationOption:0.45]),jpeg.count <= 280000 else { gate.signal(); return }
        let base64 = jpeg.base64EncodedString()
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            guard self.enabled, self.viewing, self.stream === stream, let web = self.web else { self.gate.signal(); return }
            web.callAsyncJavaScript("window.frame(image)",arguments:["image":base64],in:nil,in:.page) { _ in self.gate.signal() }
        }
    }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        decisionHandler(navigationAction.request.url?.isFileURL == true ? .allow : .cancel)
    }
}

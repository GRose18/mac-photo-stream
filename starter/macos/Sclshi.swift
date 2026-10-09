import Cocoa
import UniformTypeIdentifiers

// Sclshi for the beginner starter: visible, user-selected uploads to /api/photos.
// No camera capture, background service, or privileged Supabase key.
#if !SCLSHI_TEST
@main
#endif
@MainActor
final class Sclshi: NSObject, NSApplicationDelegate, URLSessionTaskDelegate {
    var window: NSWindow!
    let website = NSTextField(string: UserDefaults.standard.string(forKey: "website") ?? "")
    let email = NSTextField(string: "")
    let password = NSSecureTextField(string: "")
    let status = NSTextField(wrappingLabelWithString: "Enter your own gallery address and the same email/password you use on its website.")
    let signInButton = NSButton(title: "Sign in", target: nil, action: nil)
    let uploadButton = NSButton(title: "Choose and upload a photo…", target: nil, action: nil)
    let signOutButton = NSButton(title: "Sign out", target: nil, action: nil)
    let openButton = NSButton(title: "Open my website", target: nil, action: nil)
    var baseURL: URL?
    var token = ""
    var busy = false
    lazy var session: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 45
        config.timeoutIntervalForResource = 60
        return URLSession(configuration: config, delegate: self, delegateQueue: nil)
    }()
    static func main() {
        let app = NSApplication.shared
        let delegate = Sclshi()
        app.delegate = delegate
        app.setActivationPolicy(.regular)
        withExtendedLifetime(delegate) { app.run() }
    }
    var appName: String { Bundle.main.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String ?? "Sclshi" }
    func applicationDidFinishLaunching(_ notification: Notification) {
        let menu = NSMenu(), item = NSMenuItem(), appMenu = NSMenu()
        appMenu.addItem(withTitle: "Quit \(appName)", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        item.submenu = appMenu; menu.addItem(item)
        let editItem = NSMenuItem(), editMenu = NSMenu(title: "Edit")
        for (name, action, key) in [("Cut", "cut:", "x"), ("Copy", "copy:", "c"), ("Paste", "paste:", "v"), ("Select All", "selectAll:", "a")] {
            editMenu.addItem(withTitle: name, action: Selector(action), keyEquivalent: key)
        }
        editItem.submenu = editMenu; menu.addItem(editItem); NSApp.mainMenu = menu
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 560, height: 540), styleMask: [.titled, .closable, .miniaturizable], backing: .buffered, defer: false)
        window.title = appName
        let title = NSTextField(labelWithString: appName)
        title.font = .systemFont(ofSize: 28, weight: .semibold)
        website.placeholderString = "https://your-gallery.your-account.workers.dev"
        email.placeholderString = "you@example.com"
        password.placeholderString = "Your gallery password"
        for field in [website, email, password] { field.font = .systemFont(ofSize: 14) }
        status.font = .systemFont(ofSize: 13)
        for (button, selector) in [(signInButton, #selector(signIn)), (uploadButton, #selector(choosePhoto)), (signOutButton, #selector(signOut)), (openButton, #selector(openWebsite))] {
            button.target = self; button.action = selector; button.bezelStyle = .rounded
        }
        let buttons = NSStackView(views: [signInButton, signOutButton, openButton])
        buttons.orientation = .horizontal
        let stack = NSStackView(views: [title,
            NSTextField(labelWithString: "Your website address"), website,
            NSTextField(labelWithString: "Gallery email"), email,
            NSTextField(labelWithString: "Gallery password"), password,
            buttons, uploadButton,
            NSTextField(wrappingLabelWithString: "JPEG, PNG, or WebP · up to 1 MB · only photos you choose are uploaded."), status])
        stack.orientation = .vertical; stack.alignment = .leading; stack.spacing = 12
        stack.translatesAutoresizingMaskIntoConstraints = false
        let content = window.contentView!; content.addSubview(stack)
        NSLayoutConstraint.activate([stack.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 26),
            stack.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -26),
            stack.topAnchor.constraint(equalTo: content.topAnchor, constant: 24),
            website.widthAnchor.constraint(equalTo: stack.widthAnchor), email.widthAnchor.constraint(equalTo: stack.widthAnchor),
            password.widthAnchor.constraint(equalTo: stack.widthAnchor), status.widthAnchor.constraint(equalTo: stack.widthAnchor)])
        refreshControls()
        window.center(); window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true)
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
    func applicationWillTerminate(_ notification: Notification) { session.invalidateAndCancel() }
    // Do not send credentials to a redirect target chosen by a server.
    nonisolated func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
    func address() throws -> URL {
        let text = website.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard var parts = URLComponents(string: text), parts.scheme == "https", parts.host != nil,
              parts.user == nil, parts.password == nil, parts.query == nil, parts.fragment == nil,
              parts.path.isEmpty || parts.path == "/" else { throw AppError("Enter only your website's HTTPS base address, without /api/photos or any sign-in path.") }
        parts.path = ""
        guard let url = parts.url else { throw AppError("Invalid website address.") }
        return url
    }
    func refreshControls() {
        let signedIn = !token.isEmpty
        website.isEnabled = !busy && !signedIn; email.isEnabled = !busy && !signedIn; password.isEnabled = !busy && !signedIn
        signInButton.isEnabled = !busy && !signedIn; signOutButton.isEnabled = !busy && signedIn
        uploadButton.isEnabled = !busy && signedIn; openButton.isEnabled = !busy
    }
    func run(_ operation: @escaping @MainActor () async throws -> String) {
        guard !busy else { return }
        busy = true; status.stringValue = "Working…"; refreshControls()
        Task { @MainActor in
            defer { busy = false; refreshControls() }
            do { status.stringValue = try await operation() }
            catch { status.stringValue = error.localizedDescription }
        }
    }
    func send(path: String, body: Data, contentType: String, authorization: String? = nil) async throws -> [String: Any] {
        guard let base = baseURL else { throw AppError("Sign in first.") }
        var request = URLRequest(url: base.appendingPathComponent(path))
        request.httpMethod = "POST"; request.httpBody = body
        request.setValue(contentType, forHTTPHeaderField: "Content-Type")
        if let authorization = authorization { request.setValue("Bearer \(authorization)", forHTTPHeaderField: "Authorization") }
        let (data, response) = try await session.data(for: request)
        guard let response = response as? HTTPURLResponse else { throw AppError("No server response. Check your address.") }
        let result = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        guard (200..<300).contains(response.statusCode) else {
            if response.statusCode == 401 { token = "" }
            throw AppError(result["error"] as? String ?? "Request failed (\(response.statusCode)). Check that this is your beginner starter website.")
        }
        return result
    }
    @objc func signIn() {
        run { [self] in
            baseURL = try address()
            guard !email.stringValue.isEmpty, !password.stringValue.isEmpty else { throw AppError("Enter your gallery email and password.") }
            let body = try JSONSerialization.data(withJSONObject: ["email": email.stringValue.trimmingCharacters(in: .whitespacesAndNewlines), "password": password.stringValue])
            defer { password.stringValue = "" }
            let result = try await send(path: "api/login", body: body, contentType: "application/json")
            guard let access = result["access_token"] as? String, !access.isEmpty else { throw AppError("This website did not return a starter sign-in token.") }
            token = access; UserDefaults.standard.set(baseURL!.absoluteString, forKey: "website")
            return "Signed in. Choose a photo to upload to this account's private library."
        }
    }
    @objc func signOut() {
        token = ""; baseURL = nil; password.stringValue = ""
        status.stringValue = "Signed out of this app."; refreshControls()
    }
    @objc func openWebsite() {
        do { NSWorkspace.shared.open(try address()) } catch { status.stringValue = error.localizedDescription }
    }
    @objc func choosePhoto() {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.jpeg, .png, .webP]
        panel.canChooseDirectories = false; panel.allowsMultipleSelection = false
        panel.message = "Choose one photo to upload to your own gallery."
        panel.prompt = "Upload this photo"
        guard panel.runModal() == .OK, let file = panel.url else { return }
        run { [self] in
            let size = try file.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
            guard size > 0 && size <= 1_000_000 else { throw AppError("Choose a photo no larger than 1,000,000 bytes. Resize it first if needed.") }
            let data = try Data(contentsOf: file)
            guard data.count <= 1_000_000 else { throw AppError("This photo is too large.") }
            let types = ["jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp"]
            guard let mime = types[file.pathExtension.lowercased()] else { throw AppError("Choose a JPEG, PNG, or WebP photo.") }
            let result = try await send(path: "api/photos", body: data, contentType: mime, authorization: token)
            guard result["name"] is String else { throw AppError("Unexpected upload reply. Check your gallery before retrying.") }
            return "Uploaded \(file.lastPathComponent). Open your website, sign into the same account, and click Refresh photos."
        }
    }
}
struct AppError: LocalizedError {
    let message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}

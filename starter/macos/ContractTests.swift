// Synthetic network test. Never contacts a website or opens the file picker.
import Cocoa
final class Stub: URLProtocol {
    static var requests: [URLRequest] = []
    static var status = 200
    static var reply = "{}"
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        Self.requests.append(request)
        let response = HTTPURLResponse(url: request.url!, statusCode: Self.status, httpVersion: nil, headerFields: ["Content-Type":"application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(Self.reply.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}
@main
struct ContractTests {
    @MainActor static func main() async throws {
        let app = Sclshi()
        for value in ["http://gallery.example", "https://gallery.example/api/photos", "https://user:password@gallery.example", "https://gallery.example/?token=x"] {
            app.website.stringValue = value
            do { _ = try app.address(); fatalError("Accepted unsafe base address") }
            catch is AppError {}
        }
        app.website.stringValue = "https://gallery.example/"
        app.baseURL = try app.address()
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [Stub.self]
        app.session = URLSession(configuration: config)
        Stub.reply = "{\"access_token\":\"test-session\"}"
        let login = try await app.send(path: "api/login", body: Data("{}".utf8), contentType: "application/json")
        assert(login["access_token"] as? String == "test-session")
        assert(Stub.requests.last!.url!.absoluteString == "https://gallery.example/api/login")
        assert(Stub.requests.last!.httpMethod == "POST")
        assert(Stub.requests.last!.value(forHTTPHeaderField: "Authorization") == nil)
        Stub.reply = "{\"name\":\"test.jpg\"}"
        _ = try await app.send(path: "api/photos", body: Data([255,216,255,217]), contentType: "image/jpeg", authorization: "test-session")
        assert(Stub.requests.last!.url!.path == "/api/photos")
        assert(Stub.requests.last!.value(forHTTPHeaderField: "Authorization") == "Bearer test-session")
        assert(Stub.requests.last!.value(forHTTPHeaderField: "Content-Type") == "image/jpeg")
        Stub.status = 401; Stub.reply = "{\"error\":\"Please sign in again.\"}"; app.token = "expired"
        do { _ = try await app.send(path: "api/photos", body: Data(), contentType: "image/jpeg", authorization: app.token); fatalError("Accepted expired session") }
        catch { assert(error.localizedDescription == "Please sign in again.") }
        assert(app.token.isEmpty)
        app.session.invalidateAndCancel()
        print("Native URL validation, starter API routing, bearer authentication, and expired-session checks passed. No network access or capture.")
    }
}

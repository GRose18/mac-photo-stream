import Cocoa
import AVFoundation

// Runs inside the already camera-authorized GUI app, never inside the SSH process.
final class CameraVideo: NSObject, AVCaptureFileOutputRecordingDelegate {
    let work = DispatchQueue(label: "com.gaberose.sclshi.video")
    var session: AVCaptureSession?
    var movie: AVCaptureMovieFileOutput?
    var complete = false
    var cancelled = false
    var onStatus: ((String) -> Void)?
    var onFinish: ((URL?, String) -> Void)?

    func start(at url: URL) {
        work.async {
            do {
                guard !self.cancelled else { self.finish(nil, "Recording cancelled"); return }
                guard let camera = AVCaptureDevice.default(for: .video) else { self.finish(nil, "No camera available"); return }
                let input = try AVCaptureDeviceInput(device: camera)
                let session = AVCaptureSession(), movie = AVCaptureMovieFileOutput()
                if session.canSetSessionPreset(.vga640x480) { session.sessionPreset = .vga640x480 }
                else { session.sessionPreset = .medium }
                guard session.canAddInput(input), session.canAddOutput(movie) else { self.finish(nil, "Camera unavailable or in use"); return }
                session.addInput(input); session.addOutput(movie)
                // No audio input is attached. AVFoundation itself enforces both bounds.
                movie.maxRecordedDuration = CMTime(seconds: 10, preferredTimescale: 600)
                movie.maxRecordedFileSize = 20_000_000
                movie.minFreeDiskSpaceLimit = 1_000_000_000
                self.session = session; self.movie = movie
                session.startRunning()
                guard session.isRunning else { self.finish(nil, "Camera did not start"); return }
                movie.startRecording(to: url, recordingDelegate: self)
                self.work.asyncAfter(deadline: .now() + 30) {
                    guard !self.complete else { return }
                    self.cancelled = true
                    if movie.isRecording { movie.stopRecording() }
                    self.finish(nil, "Recording timed out; partial file retained")
                }
            } catch { self.finish(nil, "Recording failed: \(error.localizedDescription)") }
        }
    }
    func cancel() {
        work.async {
            guard !self.complete else { return }
            self.cancelled = true
            if self.movie?.isRecording == true { self.movie?.stopRecording() }
            self.finish(nil, "Recording cancelled; no upload started")
        }
    }
    func finish(_ url: URL?, _ message: String) {
        guard !complete else { return }; complete = true
        session?.stopRunning(); session = nil; movie = nil
        DispatchQueue.main.async { self.onFinish?(url, message) }
    }
    func fileOutput(_ output: AVCaptureFileOutput, didStartRecordingTo fileURL: URL, from connections: [AVCaptureConnection]) {
        DispatchQueue.main.async { self.onStatus?("Recording · 10 seconds") }
    }
    func fileOutput(_ output: AVCaptureFileOutput, didFinishRecordingTo fileURL: URL, from connections: [AVCaptureConnection], error: Error?) {
        work.async {
            guard !self.complete else { return }
            if self.cancelled { self.finish(nil, "Recording cancelled"); return }
            if let error = error as NSError?, error.userInfo[AVErrorRecordingSuccessfullyFinishedKey] as? Bool != true {
                self.finish(nil, "Recording failed: \(error.localizedDescription)"); return
            }
            self.finish(fileURL, "Encoding and uploading video…")
        }
    }
}

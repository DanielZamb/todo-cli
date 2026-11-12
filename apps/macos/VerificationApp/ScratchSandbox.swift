import Darwin
import Foundation

@_silgen_name("sandbox_init")
private func sandboxInitialize(_ profile: UnsafePointer<CChar>, _ flags: UInt64, _ error: UnsafeMutablePointer<UnsafeMutablePointer<CChar>?>) -> Int32
@_silgen_name("sandbox_free_error")
private func sandboxFreeError(_ error: UnsafeMutablePointer<CChar>)

@MainActor enum ScratchSandbox {
    static func install(_ manifest: VerificationManifest) throws {
        guard let owner = getpwuid(getuid()), let directory = owner.pointee.pw_dir else {
            throw VerificationRefusal(message: "The owner home could not be isolated.")
        }
        func literal(_ string: String) -> String {
            "\"" + string.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"") + "\""
        }
        let home = String(cString: directory)
        let port = URL(string: manifest.serverURL)!.port!
        let profile = """
        (version 1)
        (allow default)
        (deny file-write*)
        (deny file-read* file-write* (subpath \(literal(home))))
        (allow file-read* (subpath \(literal(Bundle.main.bundlePath))))
        (allow file-read* file-write* (subpath \(literal(manifest.root))))
        (deny network-outbound)
        (allow network-outbound (remote ip "localhost:\(port)"))
        (deny process-exec)
        (deny mach-lookup (global-name "com.apple.securityd"))
        """
        var error: UnsafeMutablePointer<CChar>?
        let result = profile.withCString { sandboxInitialize($0, 0, &error) }
        let message = error.map { String(cString: $0) }
        if let error { sandboxFreeError(error) }
        try LaunchGuard.require(result == 0, "The scratch sandbox could not be installed: \(message ?? "unknown failure").")
    }
}

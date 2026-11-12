import Darwin
import Foundation

@_silgen_name("sandbox_init")
private func sandboxInitialize(_ profile: UnsafePointer<CChar>, _ flags: UInt64, _ error: UnsafeMutablePointer<UnsafeMutablePointer<CChar>?>) -> Int32
@_silgen_name("sandbox_free_error")
private func sandboxFreeError(_ error: UnsafeMutablePointer<CChar>)

@MainActor enum ScratchSandbox {
    private static var installed: String?
    static func install(_ manifest: VerificationManifest) throws { try install(root: manifest.root, executable: manifest.serverPath, serverURL: manifest.serverURL) }
    static func install(root: String, executable: String, serverURL: String) throws {
        let identity = root + "|" + executable + "|" + serverURL
        if let installed { try verificationRequire(installed == identity, "The process sandbox cannot change its bound scratch run."); return }
        guard let owner = getpwuid(getuid()), let directory = owner.pointee.pw_dir else {
            throw VerificationRefusal(message: "The owner home could not be isolated.")
        }
        func literal(_ string: String) -> String {
            "\"" + string.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"") + "\""
        }
        let home = String(cString: directory)
        let port = URL(string: serverURL)!.port!
        let profile = """
        (version 1)
        (allow default)
        (deny file-read*)
        (allow file-read-data (literal "/"))
        (deny file-write*)
        (allow file-read* (subpath "/System") (subpath "/usr/lib") (subpath "/usr/share") (subpath "/Library/Apple") (subpath "/Library/Fonts") (subpath "/private/var/db/timezone"))
        (deny file-read* file-write* (subpath "/Library/Keychains") (subpath "/System/Library/Keychains") (subpath "/private/var/Keychains"))
        (allow file-read* file-write-data (literal "/dev/null"))
        (allow file-read* (literal "/dev/random" "/dev/urandom" "/usr/bin/true"))
        (deny file-read* file-write* (subpath \(literal(home))))
        (allow file-read* (subpath \(literal(Bundle.main.bundlePath))))
        (allow file-read* file-write* (subpath \(literal(root))))
        (allow file-write-flags (subpath \(literal(root))))
        (allow file-write-flags (literal "/private/tmp/todo-mac-verify-machine-lock" "/private/tmp/todo-mac-verify-machine-lock/.instance-lock"))
        (deny network-outbound)
        (allow network-outbound (remote ip4 "localhost:\(port)"))
        (deny process-exec)
        (allow process-exec (literal \(literal(executable))))
        (deny mach-lookup)
        (allow mach-lookup (global-name "com.apple.windowserver.active" "com.apple.windowserver" "com.apple.FontObjectsServer"))
        """
        var error: UnsafeMutablePointer<CChar>?
        let result = profile.withCString { sandboxInitialize($0, 0, &error) }
        let message = error.map { String(cString: $0) }
        if let error { sandboxFreeError(error) }
        try verificationRequire(result == 0, "The scratch sandbox could not be installed: \(message ?? "unknown failure").")
        installed = identity
    }
}

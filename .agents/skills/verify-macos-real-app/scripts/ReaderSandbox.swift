import Darwin
import Foundation

@_silgen_name("sandbox_init")
private func readerSandboxInitialize(_ profile: UnsafePointer<CChar>, _ flags: UInt64, _ error: UnsafeMutablePointer<UnsafeMutablePointer<CChar>?>) -> Int32
@_silgen_name("sandbox_free_error")
private func readerSandboxFreeError(_ error: UnsafeMutablePointer<CChar>)

@MainActor enum ReaderSandbox {
    static func install(appBundle: String) throws {
        guard let home = ProcessInfo.processInfo.environment["HOME"], home.hasSuffix("/home"),
              let owner = getpwuid(getuid()), let ownerDirectory = owner.pointee.pw_dir else {
            throw VerificationRefusal(message: "The accessibility reader requires an owned scratch HOME.")
        }
        let files = try ScratchFiles(String(home.dropLast(5)))
        _ = try files.open(home, directory: true, privateMode: true)
        let temporary = try files.open(files.root.path + "/tmp", directory: true, privateMode: true)
        bindTemporaryDirectory(temporary.fd)
        try verificationRequire(ProcessInfo.processInfo.environment["CFFIXED_USER_HOME"] == home && ProcessInfo.processInfo.environment["TMPDIR"] == temporary.path, "The reader's HOME and temporary settings must agree.")
        func literal(_ value: String) -> String { "\"" + value.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"") + "\"" }
        let profile = """
        (version 1)
        (allow default)
        (deny file-read*)
        (allow file-read-data (literal "/"))
        (deny file-write*)
        (allow file-read* (subpath "/System") (subpath "/usr/lib") (subpath "/usr/share") (subpath "/Library/Apple") (subpath "/Library/Fonts") (subpath "/private/var/db/timezone"))
        (deny file-read* file-write* (subpath "/Library/Keychains") (subpath "/System/Library/Keychains") (subpath "/private/var/Keychains"))
        (allow file-read* file-write-data (literal "/dev/null"))
        (allow file-read* (literal "/dev/random" "/dev/urandom"))
        (deny file-read* file-write* (subpath \(literal(String(cString: ownerDirectory)))))
        (allow file-read* (subpath \(literal(Bundle.main.bundlePath))) (subpath \(literal(appBundle))))
        (allow file-read* file-write* (subpath \(literal(files.root.path))))
        (deny network-outbound)
        (deny process-exec)
        (deny mach-lookup)
        (allow mach-lookup (global-name "com.apple.windowserver.active" "com.apple.windowserver" "com.apple.FontObjectsServer" "com.apple.coreservices.launchservicesd" "com.apple.tccd.system"))
        """
        var error: UnsafeMutablePointer<CChar>?
        let status = profile.withCString { readerSandboxInitialize($0, 0, &error) }
        let message = error.map { String(cString: $0) }
        if let error { readerSandboxFreeError(error) }
        try verificationRequire(status == 0, "The accessibility reader's sandbox failed: \(message ?? "unknown error").")
        try VerificationDirectories.install()
        try VerificationDefaults.install()
    }
}

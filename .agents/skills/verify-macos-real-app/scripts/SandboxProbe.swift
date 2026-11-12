import Darwin
import Foundation

@_silgen_name("verification_security_service_denied")
private func securityServiceDenied() -> Int32
@_silgen_name("verification_true_execution")
private func trueExecution(_ directory: UnsafePointer<CChar>) -> Int32

@main struct SandboxProbe {
    @MainActor static func main() {
        do { try run() }
        catch {
            FileHandle.standardError.write(Data((error.localizedDescription + "\n").utf8))
            exit(78)
        }
    }
    private static func connection(_ port: UInt16) -> (Int32, Int32) {
        let fd = socket(AF_INET, SOCK_STREAM, 0)
        defer { close(fd) }
        var address = sockaddr_in()
        address.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
        address.sin_family = sa_family_t(AF_INET)
        address.sin_port = port.bigEndian
        address.sin_addr.s_addr = inet_addr("127.0.0.1")
        let result = withUnsafePointer(to: &address) { pointer in
            pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { connect(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) }
        }
        return (result, errno)
    }
    @MainActor static func run() throws {
        let path = ProcessInfo.processInfo.environment["TODO_VERIFICATION_MANIFEST"]!
        let manifest = try JSONDecoder().decode(VerificationManifest.self, from: Data(contentsOf: URL(fileURLWithPath: path)))
        let forbidden = URL(fileURLWithPath: CommandLine.arguments[1])
        let outside = URL(fileURLWithPath: CommandLine.arguments[3])
        let bundleMarker = URL(fileURLWithPath: CommandLine.arguments[4])
        let allowed = URL(fileURLWithPath: manifest.home).appendingPathComponent("sandbox-proof")
        guard manifest.root.withCString({ trueExecution($0) }) == 0 else { exit(2) }
        try ScratchSandbox.install(manifest)
        try Data("scratch only".utf8).write(to: allowed)
        let scratch = try String(contentsOf: allowed, encoding: .utf8) == "scratch only"
        let deniedRead = (try? Data(contentsOf: forbidden)) == nil
        let deniedWrite = (try? Data("must not write".utf8).write(to: forbidden)) == nil
        let globalWriteDenied = (try? Data("mutant sentinel".utf8).write(to: outside)) == nil
        let bundleRead = (try? String(contentsOf: bundleMarker, encoding: .utf8)) == "owned bundle marker"
        let deniedExec = manifest.root.withCString { trueExecution($0) } == 1
        let other = connection(UInt16(CommandLine.arguments[2])!)
        let server = connection(UInt16(URL(string: manifest.serverURL)!.port!))
        let result = ["scratchReadWrite": scratch, "ownerPathReadDenied": deniedRead, "ownerPathWriteDenied": deniedWrite, "globalWriteDenied": globalWriteDenied, "bundleRead": bundleRead, "processExecDenied": deniedExec, "otherLoopbackPortDenied": other.0 == -1 && other.1 == EPERM, "scratchServerConnect": server.0 == 0, "securityServiceLookupDenied": securityServiceDenied() != 0]
        FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject: result, options: .sortedKeys))
        if !result.values.allSatisfy({ $0 }) { exit(1) }
    }
}

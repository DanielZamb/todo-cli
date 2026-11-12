import Darwin
import Foundation

@main struct SandboxProbe {
    @MainActor static func main() {
        do { try run() }
        catch {
            FileHandle.standardError.write(Data((error.localizedDescription + "\n").utf8))
            exit(78)
        }
    }
    @MainActor static func run() throws {
        let path = ProcessInfo.processInfo.environment["TODO_VERIFICATION_MANIFEST"]!
        let manifest = try JSONDecoder().decode(VerificationManifest.self, from: Data(contentsOf: URL(fileURLWithPath: path)))
        let forbidden = URL(fileURLWithPath: CommandLine.arguments[1])
        let allowed = URL(fileURLWithPath: manifest.home).appendingPathComponent("sandbox-proof")
        try ScratchSandbox.install(manifest)
        try Data("scratch only".utf8).write(to: allowed)
        let scratch = try String(contentsOf: allowed, encoding: .utf8) == "scratch only"
        let deniedRead = (try? Data(contentsOf: forbidden)) == nil
        let deniedWrite = (try? Data("must not write".utf8).write(to: forbidden)) == nil
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/true")
        let deniedExec: Bool
        do { try process.run(); process.waitUntilExit(); deniedExec = false } catch { deniedExec = true }
        let fd = socket(AF_INET, SOCK_STREAM, 0)
        defer { close(fd) }
        var address = sockaddr_in()
        address.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
        address.sin_family = sa_family_t(AF_INET)
        address.sin_port = UInt16(CommandLine.arguments[2])!.bigEndian
        address.sin_addr.s_addr = inet_addr("127.0.0.1")
        let connected = withUnsafePointer(to: &address) { pointer in
            pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { connect(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) }
        }
        let deniedNetwork = connected == -1 && errno == EPERM
        let result = ["scratchReadWrite": scratch, "ownerPathReadDenied": deniedRead, "ownerPathWriteDenied": deniedWrite, "processExecDenied": deniedExec, "otherLoopbackPortDenied": deniedNetwork]
        FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject: result, options: .sortedKeys))
        if !result.values.allSatisfy({ $0 }) { exit(1) }
    }
}

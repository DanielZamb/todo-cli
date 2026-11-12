import AppKit
import Darwin

@main struct IdentityCensus {
    @MainActor static func main() throws {
        guard CommandLine.arguments.count == 2, let pid = Int32(CommandLine.arguments[1]) else { exit(2) }
        let target = NSRunningApplication(processIdentifier: pid)
        var executable = [CChar](repeating: 0, count: 4 * Int(MAXPATHLEN))
        let length = proc_pidpath(pid, &executable, UInt32(executable.count))
        let result: [String: Any] = [
            "ownedTargetPID": pid,
            "ownedTargetExecutable": length > 0 ? String(cString: executable) : "missing",
            "lookupByOwnedPID": ["bundleIdentifier": target?.bundleIdentifier ?? "missing", "bundlePath": target?.bundleURL?.path ?? "missing", "activationPolicy": target?.activationPolicy.rawValue ?? -1, "finishedLaunching": target?.isFinishedLaunching ?? false],
            "lookupByVerificationBundleID": NSRunningApplication.runningApplications(withBundleIdentifier: "local.todo.verification").map { $0.processIdentifier },
            "readerPID": getpid(),
            "readerHome": ProcessInfo.processInfo.environment["HOME"] ?? "missing",
            "readerFixedHome": ProcessInfo.processInfo.environment["CFFIXED_USER_HOME"] ?? "missing",
            "readerXPCService": ProcessInfo.processInfo.environment["XPC_SERVICE_NAME"] ?? "missing",
            "readerCFBundleEnvironment": ProcessInfo.processInfo.environment["__CFBundleIdentifier"] ?? "missing"
        ]
        FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject: result, options: [.prettyPrinted, .sortedKeys]))
    }
}

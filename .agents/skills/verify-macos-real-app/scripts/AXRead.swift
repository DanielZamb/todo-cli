import AppKit
import ApplicationServices

@_silgen_name("verification_window_id")
private func windowID(_ window: AXUIElement) -> CGWindowID
@_silgen_name("todo_verification_trap_ready")
private func readerTrapReady()
@_silgen_name("verification_hid_idle_seconds")
private func readerHIDIdleSeconds() -> Double

@main struct AXRead {
    @MainActor static func main() throws {
        readerTrapReady()
        try ReaderSandbox.install(appBundle: VerificationReaderBuild.appBundlePath)
        if CommandLine.arguments.count == 2 && CommandLine.arguments[1] == "--idle-only" {
            let session = CGEventSource.secondsSinceLastEventType(.combinedSessionState, eventType: CGEventType(rawValue: UInt32.max)!)
            let hid = readerHIDIdleSeconds()
            FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject: ["sessionIdleSeconds": session, "hidIdleSeconds": hid, "windowRead": false], options: .sortedKeys))
            guard session >= 0 && hid >= 0 else { exit(78) }
            guard session >= 60 && hid >= 60 else { exit(80) }
            return
        }
        if CommandLine.arguments.count == 2 && CommandLine.arguments[1] == "--permission-only" {
            let accessibility = AXIsProcessTrusted(), capture = CGPreflightScreenCaptureAccess()
            FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject: ["accessibility": accessibility, "screenCapture": capture, "windowRead": false], options: .sortedKeys))
            guard accessibility && capture else { exit(78) }
            return
        }
        guard CommandLine.arguments.count == 2, let pid = Int32(CommandLine.arguments[1]) else { exit(2) }
        guard NSRunningApplication.runningApplications(withBundleIdentifier: "local.todo.verification").contains(where: { $0.processIdentifier == pid && $0.bundleURL?.path == VerificationReaderBuild.appBundlePath }) else {
            let process = NSRunningApplication(processIdentifier: pid)
            FileHandle.standardError.write(Data(("Verification PID identity pending: " + (process?.bundleIdentifier ?? "missing") + "\n").utf8))
            exit(2)
        }
        guard AXIsProcessTrusted() else {
            FileHandle.standardError.write(Data("Accessibility permission is unavailable; no prompt was requested.\n".utf8))
            exit(78)
        }
        let app = AXUIElementCreateApplication(pid)
        var rows: [[String: String]] = []
        func read(_ node: AXUIElement, _ key: String) -> CFTypeRef? {
            var value: CFTypeRef?
            return AXUIElementCopyAttributeValue(node, key as CFString, &value) == .success ? value : nil
        }
        func visit(_ node: AXUIElement, _ depth: Int) {
            guard depth < 60, rows.count < 10000 else { return }
            var row: [String: String] = [:]
            for key in [kAXRoleAttribute, kAXTitleAttribute, kAXValueAttribute, kAXDescriptionAttribute, kAXIdentifierAttribute] {
                if let string = read(node, key) as? String { row[key] = string }
            }
            if !row.isEmpty { rows.append(row) }
            if let children = read(node, kAXChildrenAttribute) as? [AXUIElement] {
                for child in children { visit(child, depth + 1) }
            }
        }
        if let windows = read(app, kAXWindowsAttribute) as? [AXUIElement] {
            let titles = windows.compactMap { read($0, kAXTitleAttribute) as? String }
            FileHandle.standardError.write(try JSONSerialization.data(withJSONObject: ["bundleIdentifier": "local.todo.verification", "pid": pid, "windowTitles": titles], options: .sortedKeys))
            for window in windows where read(window, kAXTitleAttribute) as? String == "Todo Verification" || read(window, kAXMainAttribute) as? Bool == true {
                rows.append(["bundleIdentifier": "local.todo.verification", "pid": String(pid)])
                visit(window, 0)
                let number = windowID(window)
                if number != 0 {
                    rows.append(["role": "CGWindow", "CGWindowID": String(number)])
                }
            }
        }
        FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject: rows, options: [.prettyPrinted, .sortedKeys]))
    }
}

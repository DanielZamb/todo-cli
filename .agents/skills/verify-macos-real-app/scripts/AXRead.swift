import AppKit
import ApplicationServices

@main struct AXRead {
    static func main() throws {
        guard CommandLine.arguments.count == 2, let pid = Int32(CommandLine.arguments[1]) else { exit(2) }
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
        visit(app, 0)
        if let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] {
            for window in windows where window[kCGWindowOwnerPID as String] as? Int32 == pid && window[kCGWindowLayer as String] as? Int == 0 {
                if let number = window[kCGWindowNumber as String] as? UInt32 {
                    rows.append(["role": "CGWindow", "CGWindowID": String(number)])
                }
            }
        }
        FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject: rows, options: [.prettyPrinted, .sortedKeys]))
    }
}

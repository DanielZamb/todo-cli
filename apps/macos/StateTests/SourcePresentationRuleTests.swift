import Foundation
import Testing

/// MAC-C1-S1-17, a source-level control. A decision to present is never taken before an await and
/// used after it: no "may present", "is showing", "is newest" or "is current" value may cross an
/// await as a parameter. Read-backs take a `ReadBackOwner` (a ticket and a surface instance),
/// asked when they publish. This fails if a removed parameter or pattern comes back.
@Suite struct SourcePresentationRuleTests {
    private var sources: URL { URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Sources") }

    private func swiftSources() throws -> [(String, String)] {
        try FileManager.default.contentsOfDirectory(at: sources, includingPropertiesForKeys: nil)
            .filter { $0.pathExtension == "swift" }
            .map { url in
                // Comment lines are prose ("the newest run presents: …"), not parameters; blank them
                // so line numbers stay true.
                let text = try String(contentsOf: url, encoding: .utf8)
                let code = text.split(separator: "\n", omittingEmptySubsequences: false)
                    .map { $0.trimmingCharacters(in: .whitespaces).hasPrefix("//") ? "" : String($0) }
                    .joined(separator: "\n")
                return (url.lastPathComponent, code)
            }
    }

    @Test func noPresentationPermissionCrossesAnAwaitAsAValue() throws {
        let files = try swiftSources()
        #expect(files.count > 40, "read the Mac sources")
        let forbidden: [(String, String)] = [
            (#"\bpresents\s*:"#, "refreshAfterWrite(presents:) was removed"),
            (#"refreshAfterWrite\([^)]*\bpresenting\s*:"#, "refreshAfterWrite(presenting:) was replaced by owner:"),
            (#"presenting\s*:\s*showing\s*\?"#, "a pre-await showing must not choose a read-back's presenter"),
            (#"\bopenSeries\(\s*presenting"#, "openSeries(presenting:) was split into openSeries() and loadSeries()"),
            (#"reloadDependencyPicker\(\s*clearing"#, "reloadDependencyPicker(clearing:) was split into reload and refresh"),
            (#"func\s+\w+\([^)]*\b(presents|presenting|showing|isShowing|mayPresent|isNewest|isCurrent|stillShowing|clearing)\s*:\s*Bool"#, "a Bool parameter carrying presentation permission"),
        ]
        var found: [String] = []
        for (name, text) in files {
            for (pattern, reason) in forbidden {
                let regex = try NSRegularExpression(pattern: pattern)
                for match in regex.matches(in: text, range: NSRange(text.startIndex..., in: text)) {
                    let line = text[..<Range(match.range, in: text)!.lowerBound].split(separator: "\n", omittingEmptySubsequences: false).count
                    found.append("\(name):\(line): \(reason)")
                }
            }
        }
        #expect(found.isEmpty, "\(found.joined(separator: "\n"))")
    }

    @Test func theControlDetectsAReintroducedParameter() throws {
        // The control's own sensitivity: each removed form, as it was written, is caught.
        let samples = [
            "await refreshAfterWrite(\"Task added\", presenting: showing ? nil : surface, presents: createTicket.isNewest)",
            "func openSeries(presenting: Bool = true) async {",
            "await reloadDependencyPicker(clearing: false)",
        ]
        let patterns = [#"\bpresents\s*:"#, #"\bopenSeries\(\s*presenting"#, #"reloadDependencyPicker\(\s*clearing"#]
        for (sample, pattern) in zip(samples, patterns) {
            let regex = try NSRegularExpression(pattern: pattern)
            #expect(regex.firstMatch(in: sample, range: NSRange(sample.startIndex..., in: sample)) != nil, "\(pattern) catches \(sample)")
        }
    }
}

import Foundation
import Testing

/// MAC-C1-S1-32, a source-level control. Every person action reaches the one entry point
/// (`PersonInput`, through `TodoModel.notePersonActed()`), and there is one input monitor. It fails
/// when:
/// - a second `addLocalMonitorForEvents` (or any global monitor) appears;
/// - a menu command (TodoApp's `.commands`), an `.accessibilityAction`, a drop or a paste command
///   does not call `notePersonActed`;
/// - a call to any write operation of the contract (every non-GET operation in openapi.json) is not
///   preceded, in its function, by `notePersonActed()`, unless it is listed below with a reason;
/// - a sheet, alert, dialog, popover or file panel is driven by state that does not mark when it
///   is presented, unless it is view-local state listed below with a reason.
@Suite struct PersonInputSourceRuleTests {
    private var macos: URL { URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent() }

    /// Comment lines blanked (prose is not code), line numbers kept.
    private func sources() throws -> [(String, String)] {
        try FileManager.default.contentsOfDirectory(at: macos.appendingPathComponent("Sources"), includingPropertiesForKeys: nil)
            .filter { $0.pathExtension == "swift" }
            .map { url in
                let text = try String(contentsOf: url, encoding: .utf8)
                return (url.lastPathComponent, text.split(separator: "\n", omittingEmptySubsequences: false)
                    .map { $0.trimmingCharacters(in: .whitespaces).hasPrefix("//") ? "" : String($0) }.joined(separator: "\n"))
            }
    }
    /// Code only: every `//` comment removed, so a mark written in a comment is not a mark (S1-37).
    static func codeOnly(_ text: String) -> String {
        text.split(separator: "\n", omittingEmptySubsequences: false).map { line in
            line.range(of: "//").map { String(line[..<$0.lowerBound]) } ?? String(line)
        }.joined(separator: "\n")
    }
    /// Every menu item: Button, Toggle and Picker lines inside `.commands { … }` and inside any type
    /// that conforms to `Commands` (S1-37).
    static func commandItems(in text: String) throws -> [String] {
        var blocks: [Substring] = []
        for pattern in [#"\.commands\s*\{"#, #"(struct|extension)\s+\w+\s*:\s*Commands\s*\{"#] {
            let regex = try NSRegularExpression(pattern: pattern)
            for match in regex.matches(in: text, range: NSRange(text.startIndex..., in: text)) {
                let range = Range(match.range, in: text)!
                blocks.append(extent(text, from: text.index(before: range.upperBound), trailing: false))
            }
        }
        return blocks.flatMap { $0.split(separator: "\n").map(String.init) }.filter { $0.contains("Button(") || $0.contains("Toggle(") || $0.contains("Picker(") }
    }
    private func line(_ text: String, _ offset: String.Index) -> Int { text[..<offset].split(separator: "\n", omittingEmptySubsequences: false).count }
    private func matches(_ pattern: String, _ text: String) throws -> [Range<String.Index>] {
        try NSRegularExpression(pattern: pattern).matches(in: text, range: NSRange(text.startIndex..., in: text)).map { Range($0.range, in: text)! }
    }
    /// From an opening bracket, the text through its partner; then any trailing closures
    /// (`) { … }` and `} label: { … }`).
    static func extent(_ text: String, from start: String.Index, trailing: Bool = true) -> Substring {
        var index = start, depth = 0, sawOpen = false
        while index < text.endIndex {
            let character = text[index]
            if character == "(" || character == "{" { depth += 1; sawOpen = true }
            if character == ")" || character == "}" { depth -= 1 }
            index = text.index(after: index)
            if sawOpen && depth == 0 {
                if !trailing { break }
                // A trailing closure follows on the same statement.
                let rest = text[index...]
                let trimmed = rest.drop { $0 == " " }
                if trimmed.first == "{" { index = trimmed.startIndex; continue }
                if let labelled = try? #/^\s*\w+:\s*\{/#.prefixMatch(in: String(rest.prefix(80))), !labelled.output.isEmpty,
                   let brace = rest.firstIndex(of: "{") { index = brace; continue }
                break
            }
        }
        return text[start..<index]
    }

    /// Write calls that need no mark, each with its reason.
    static let notWrites: [String: String] = [
        "parse/reads_period_quickAdd": "a parse: it changes nothing, and runs while the person types the title (newTitle counts)",
        "reloadDependencyDelete/tasks_period_delete": "a dry run (dry_run: true) that changes nothing; it runs when the person opens the delete dialog (a presentation) or presses Reload (a click), and after a refused delete",
    ]
    /// Presentation state held in a view (not the model), each with what counts it.
    static let viewLocal: [String: String] = [
        "showingTaskFilters": "a sheet: the always-on observer counts every sheet a window begins",
        "newMetadata": "a sheet: the always-on observer counts every sheet a window begins",
        "editing": "a sheet: the always-on observer counts every sheet a window begins",
        "confirmUninstall": "a confirmation dialog (a sheet on macOS): the observer counts it",
        "exporting": "a save panel shown as a sheet: the observer counts it",
        "choosingFile": "an open panel shown as a sheet: the observer counts it",
        "choosingDate": "a popover inside the editor, which already counts as acting",
    ]
    /// Model presentation state, and the file whose declaration must mark it.
    static let modelState: [(name: String, file: String, marks: String)] = [
        ("profileDeletion", "TodoModel.swift", "notePresented("), ("batchEdit", "TodoModel.swift", "notePresented("),
        ("attachmentBatch", "TodoModel.swift", "notePresented("), ("showingImport", "TodoModel.swift", "notePresented("),
        ("transferRequest", "TodoModel.swift", "notePresented("), ("showingSeries", "TodoModel.swift", "notePresented("),
        ("pendingNavigation", "TodoModel.swift", "notePresented("), ("snapshotRestore", "TodoModel.swift", "notePresented("),
        ("showingHistory", "TodoModel.swift", "notePresented("), ("quickAdd", "TodoModel.swift", "notePersonActed()"),
        ("dialog", "Discovery.swift", "presented()"), ("graph", "Dependencies.swift", "presented()"), ("batch", "Dependencies.swift", "presented()"),
        ("picker", "Dependencies.swift", "presented()"), ("deletion", "Dependencies.swift", "presented()"),
        ("editor", "TodoModel.swift", "notePersonActed()"),
        // A view binding derived from model state, and the state it reads (S1-37: the inspector).
        ("inspectorPresented", "AppViews.swift", "model.editor != nil"),
    ]

    @Test func thereIsOneInputMonitor() throws {
        var found: [String] = []
        for (name, text) in try sources() {
            for range in try matches(#"add(Local|Global)MonitorForEvents"#, text) { found.append("\(name):\(line(text, range.lowerBound)) \(text[range])") }
        }
        #expect(found.count == 1 && found[0].hasPrefix("PersonInput.swift:") && found[0].hasSuffix("addLocalMonitorForEvents"), "\(found)")
    }

    @Test func menuCommandsDropsPastesAndAccessibilityActionsMark() throws {
        var failures: [String] = [], checked = 0
        for (name, text) in try sources() {
            for range in try matches(#"\.(accessibilityAction|onDrop|dropDestination|onPasteCommand)\("#, text) {
                checked += 1
                let statement = Self.extent(text, from: text.index(before: range.upperBound))
                if !statement.contains("notePersonActed") { failures.append("\(name):\(line(text, range.lowerBound)) \(text[range]) does not call notePersonActed") }
            }
            for item in try Self.commandItems(in: text) {
                checked += 1
                if !item.contains("notePersonActed") { failures.append("\(name): menu command does not call notePersonActed: \(item.trimmingCharacters(in: .whitespaces))") }
            }
        }
        #expect(checked >= 7, "found the commands, drops, pastes and accessibility actions (\(checked))")
        #expect(failures.isEmpty, "\(failures.joined(separator: "\n"))")
    }

    @Test func everyWriteMarksFirst() throws {
        let contract = try JSONSerialization.jsonObject(with: Data(contentsOf: macos.appendingPathComponent("API/Sources/TodoAPI/openapi.json"))) as! [String: Any]
        var writes: [String] = []
        for (_, operations) in contract["paths"] as! [String: [String: Any]] {
            for (method, operation) in operations where ["post", "put", "patch", "delete"].contains(method) {
                writes.append(((operation as! [String: Any])["operationId"] as! String).replacingOccurrences(of: ".", with: "_period_"))
            }
        }
        #expect(writes.count >= 25, "read the contract's writes (\(writes.count))")
        var failures: [String] = [], excused: Set<String> = [], calls = 0
        for (name, text) in try sources() {
            for write in writes {
                for range in try matches(#"\."# + write + #"\("#, text) {
                    calls += 1
                    let before = String(text[..<range.lowerBound])
                    guard let function = try matches(#"\bfunc\s+(\w+)"#, before).last else { failures.append("\(name): \(write) outside a function"); continue }
                    let functionName = String(before[function].split(separator: " ").last!)
                    let body = Self.codeOnly(String(before[function.lowerBound...]))
                    if let reason = Self.notWrites["\(functionName)/\(write)"], !reason.isEmpty { excused.insert("\(functionName)/\(write)"); continue }
                    if !body.contains("notePersonActed()") { failures.append("\(name):\(line(text, range.lowerBound)) \(functionName) calls \(write) without notePersonActed() first") }
                }
            }
        }
        #expect(calls >= 28, "found the write calls (\(calls))")
        #expect(excused == Set(Self.notWrites.keys), "every listed exception still exists: \(excused)")
        #expect(failures.isEmpty, "\(failures.joined(separator: "\n"))")
    }

    @Test func everyPresentationMarks() throws {
        let files = Dictionary(uniqueKeysWithValues: try sources())
        for state in Self.modelState {
            let text = try #require(files[state.file])
            let start = try #require(try matches(#"(?m)^[ \t]*(private )?var "# + state.name + #"\b"#, text).first, "\(state.name) is declared in \(state.file)")
            // The declaration with its observer block, if any.
            let lineEnd = text[start.lowerBound...].firstIndex(of: "\n") ?? text.endIndex
            let brace = text[start.lowerBound..<lineEnd].firstIndex(of: "{")
            let declaration = brace.map { String(text[start.lowerBound..<$0]) + Self.extent(text, from: $0, trailing: false) } ?? String(text[start.lowerBound..<lineEnd])
            #expect(declaration.contains(state.marks), "\(state.file): \(state.name) marks when presented: \(declaration)")
        }
        var failures: [String] = [], checked = 0
        for (name, text) in files {
            for range in try matches(#"\.(sheet|alert|confirmationDialog|popover|fileImporter|fileExporter|inspector)\("#, text) {
                checked += 1
                // The argument list only, not the presented content.
                let arguments = String(Self.extent(text, from: text.index(before: range.upperBound), trailing: false))
                let words = Set(try matches(#"\$?[A-Za-z_][A-Za-z_0-9]*"#, arguments).map { String(arguments[$0]).trimmingCharacters(in: CharacterSet(charactersIn: "$")) })
                let model = Self.modelState.map(\.name).filter(words.contains)
                let local = Self.viewLocal.keys.filter { arguments.contains("$" + $0) }
                if model.isEmpty && local.isEmpty { failures.append("\(name):\(line(text, range.lowerBound)) \(text[range]) is driven by state that does not mark") }
            }
        }
        #expect(checked >= 20, "found the presentations (\(checked))")
        #expect(failures.isEmpty, "\(failures.joined(separator: "\n"))")
    }

    @Test func theControlsCatchAMissingMark() throws {
        // Each rule's sensitivity, on samples written as the product writes them.
        let drop = #".onDrop(of: [.fileURL], isTargeted: $dropTarget) { providers in return receive(providers) }"#
        #expect(!Self.extent(drop, from: drop.firstIndex(of: "(")!).contains("notePersonActed"))
        let action = #".accessibilityAction(named: Text("Find")) { Task { await model.find() } }"#
        #expect(!Self.extent(action, from: action.firstIndex(of: "(")!).contains("notePersonActed"))
        let marked = #".onPasteCommand(of: [.png]) { providers in model.notePersonActed(); _ = receive(providers) }"#
        #expect(Self.extent(marked, from: marked.firstIndex(of: "(")!).contains("notePersonActed"), "a trailing closure is part of the statement")
        let alert = ".alert(\n  title,\n  isPresented: $flag\n) { x in\n  Text(x)\n} message: { _ in\n  model.notePersonActed()\n}"
        #expect(Self.extent(alert, from: alert.firstIndex(of: "(")!).hasSuffix("model.notePersonActed()\n}"), "a labelled trailing closure is part of the statement")
        let monitors = try matches(#"add(Local|Global)MonitorForEvents"#, "NSEvent.addLocalMonitorForEvents(matching: []) { $0 }\nNSEvent.addGlobalMonitorForEvents(matching: []) { _ in }")
        #expect(monitors.count == 2)
        // The seat's three misses on 5702b2bb (S1-37), each caught now.
        #expect(!Self.codeOnly("func save() async {\n    // notePersonActed()\n    _ = try await client.tasks_period_edit(").contains("notePersonActed"), "a mark in a comment is not a mark")
        let commands = "struct SortCommands: Commands {\n    var body: some Commands {\n        CommandMenu(\"Sort\") { Picker(\"Order\", selection: $order) { Text(\"Due\") } }\n    }\n}"
        #expect(try Self.commandItems(in: commands).contains { $0.contains("Picker(") && !$0.contains("notePersonActed") }, "a Picker in its own Commands type is a menu item")
        let inspector = ".inspector(isPresented: $showing) { Text(\"x\") }"
        #expect(try matches(#"\.(sheet|alert|confirmationDialog|popover|fileImporter|fileExporter|inspector)\("#, inspector).count == 1, "an inspector is a presentation")
    }
}

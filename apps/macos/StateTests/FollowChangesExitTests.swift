import Foundation
import Testing

/// MAC-C1-S1-36, a source-level control: the stream loop has no silent exit.
/// - Every `return` in `followChanges`, and its `while`, carries `// exit: hand-over` or
///   `// exit: owner`, and the list of exits is the literal one below: a new exit fails until it is
///   classified here. (Errors thrown inside the loop go to its own catch, which reconnects; their
///   number is fixed too.)
/// - "owner" rests on two facts this test also holds: only `disconnect()` advances the model's
///   generation (and cancels the stream), and `disconnect()` is called only by functions that start
///   the next stream or stop on purpose.
@Suite struct FollowChangesExitTests {
    private var model: String {
        get throws {
            let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Sources/TodoModel.swift")
            return try String(contentsOf: url, encoding: .utf8)
        }
    }
    /// The body of `name` (from its `func` line to the line before the next top-level member).
    private func function(_ name: String, in text: String) throws -> [String] {
        let lines = text.split(separator: "\n", omittingEmptySubsequences: false).map(String.init)
        let start = try #require(lines.firstIndex { $0.contains("func \(name)(") })
        var depth = 0, opened = false, end = start
        for index in start..<lines.count {
            for character in code(lines[index]) {
                if character == "{" { depth += 1; opened = true }
                if character == "}" { depth -= 1 }
            }
            if opened && depth == 0 { end = index; break }
        }
        return Array(lines[start...end])
    }
    private func code(_ line: String) -> String { line.components(separatedBy: "//").first ?? line }

    /// Each exit's class, in source order.
    static let exits = [
        "owner",      // while: the generation advanced or the task was cancelled
        "owner",      // after the contract check
        "owner",      // outdated server (connection offline)
        "owner",      // after the stream request
        "owner",      // each event
        "owner",      // after ready's refresh
        "owner",      // after ready's Dependency reads
        "hand-over",  // reload: back to the restored Profile
        "hand-over",  // reload: the shown Profile is gone, connect()
        "hand-over",  // ProfileDeleted: switched
        "owner",      // ProfileDeleted: cancelled
        "owner",      // ProfileDeleted: superseded by a new generation
        "owner",      // after an operation's refresh
        "owner",      // after its Dependency reads
        "owner",      // after a reminder
        "owner",      // failure frame: Unauthorized (Session ended)
        "owner",      // catch: credential replaced
        "owner",      // catch: generation or cancellation
        "owner",      // catch: 401 (Session ended)
        "hand-over",  // catch: 404, switched (or owner)
        "owner",      // catch: 404's own failure under a replaced credential
        "owner",      // quiet reconnect's sleep cancelled
        "owner",      // backoff sleep cancelled, credential replaced
        "owner",      // backoff sleep cancelled
        "owner",      // after the backoff, generation advanced
    ]

    @Test func everyExitOfTheStreamLoopIsClassified() throws {
        let body = try function("followChanges", in: model)
        var found: [String] = [], untagged: [String] = []
        for (offset, line) in body.enumerated() {
            let exits = code(line).contains("while !Task.isCancelled && generation == run") || code(line).range(of: #"\breturn\b"#, options: .regularExpression) != nil
            guard exits else { continue }
            if let tag = line.range(of: #"// exit: (hand-over|owner)"#, options: .regularExpression) {
                found.append(line[tag].contains("hand-over") ? "hand-over" : "owner")
            } else { untagged.append("followChanges +\(offset): \(line.trimmingCharacters(in: .whitespaces))") }
        }
        #expect(untagged.isEmpty, "untagged exits:\n\(untagged.joined(separator: "\n"))")
        #expect(found == Self.exits, "the exits changed; classify each new one here: \(found)")
        let throwsInLoop = body.filter { code($0).range(of: #"\bthrow\b"#, options: .regularExpression) != nil }.count
        #expect(throwsInLoop == 4, "errors thrown inside the loop reconnect through its catch; review any new one (\(throwsInLoop))")
        let deleted = body.joined(separator: "\n")
        #expect(deleted.contains("case .notNeeded, .nowhereToGo:\n") && deleted.contains("break // keep reading"), "a Profile listed again keeps the stream reading")
    }

    @Test func onlyDisconnectAdvancesTheGenerationAndItsCallersHandOverOrStop() throws {
        let text = try model
        let lines = text.split(separator: "\n", omittingEmptySubsequences: false).map(String.init)
        func enclosing(_ index: Int) -> String {
            let header = lines[...index].last { $0.range(of: #"^\s*(private |@discardableResult )*func \w+"#, options: .regularExpression) != nil } ?? ""
            return String(header.split(separator: "(").first?.split(separator: " ").last ?? "")
        }
        let advances = lines.indices.filter { code(lines[$0]).range(of: #"^\s*generation \+= 1"#, options: .regularExpression) != nil }.map(enclosing)
        #expect(advances == ["disconnect"], "\(advances)")
        // Each caller of disconnect(): connect starts the stream itself; activateProfile ends with
        // connect(); replaceCredential's callers sign in (connect) or out; signOut and expireSession stop.
        let callers = Set(lines.indices.filter { code(lines[$0]).contains("disconnect()") && !lines[$0].contains("func disconnect()") }.map(enclosing))
        #expect(callers == ["connect", "activateProfile", "replaceCredential", "signOut", "expireSession"], "\(callers.sorted())")
        let activate = try function("activateProfile", in: text)
        #expect(activate.dropLast().last?.contains("if signedIn { connect() }") == true, "activateProfile ends by starting the next stream")
    }
}

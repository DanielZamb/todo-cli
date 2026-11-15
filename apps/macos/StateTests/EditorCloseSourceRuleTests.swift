import Foundation
import Testing

/// Q13, a source-level control. Every place the editor is set to nil or replaced is one of a known
/// set, each placed in one of three groups: asks first (the draft question), cannot ask (the Task or
/// the Profile is gone, a Snapshot reload, sign-out), or closes after a write the person chose. A
/// person's close in a view never clears the editor itself: it calls `closeInspector()`, which goes
/// through `TodoModel.closeEditor`. A new site fails here until it is placed. The toolbar's Inspector
/// button and Compact's back button are proven here because a hosted window builds no accessibility
/// tree to press them; Escape, the system dismissing the inspector and the room rule are driven in
/// `EditorCloseTests` through the same `closeInspector()`.
@Suite struct EditorCloseSourceRuleTests {
    private var sources: URL { URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Sources") }

    /// Comment lines blanked, line numbers kept.
    private func code(_ name: String) throws -> String {
        try String(contentsOf: sources.appendingPathComponent(name), encoding: .utf8).split(separator: "\n", omittingEmptySubsequences: false)
            .map { $0.trimmingCharacters(in: .whitespaces).hasPrefix("//") ? "" : String($0) }.joined(separator: "\n")
    }
    private func files() throws -> [String] {
        try FileManager.default.contentsOfDirectory(atPath: sources.path).filter { $0.hasSuffix(".swift") }.sorted()
    }
    /// "File function" for each match of `pattern`, by the nearest `func` before it.
    private func sites(_ pattern: String) throws -> [String] {
        let regex = try NSRegularExpression(pattern: pattern), function = try NSRegularExpression(pattern: #"\bfunc\s+(\w+)"#)
        var found: [String] = []
        for name in try files() {
            let text = try code(name)
            for match in regex.matches(in: text, range: NSRange(text.startIndex..., in: text)) {
                let before = NSRange(location: 0, length: match.range.location)
                let enclosing = function.matches(in: text, range: before).last.map { (text as NSString).substring(with: $0.range(at: 1)) } ?? "-"
                found.append("\(name) \(enclosing)")
            }
        }
        return found
    }

    @Test func everyPlaceTheEditorIsClearedIsKnown() throws {
        #expect(try sites(#"\beditor\s*=\s*nil"#) == [
            "Discovery.swift applyDiscoveryShow", // asks first: navigate(.showDiscovery)
            "TodoModel.swift signOut", // cannot ask: sign-out
            "TodoModel.swift leaveDeletedProfile", // cannot ask: the Profile is gone; the notice names it and where the window went
            "TodoModel.swift followChanges", // cannot ask: a Snapshot reload replaces the whole scope
            "TodoModel.swift save", // closes after the person's Save succeeded
            "TodoModel.swift endEditing", // closeEditor (clean) and the answered question
            "TodoModel.swift applyNavigation", // asks first: openTransfer
            "TodoModel.swift applyNavigation", // asks first: a Profile switch
            "TodoModel.swift performTransition", // asks first: transition
            "TodoModel.swift deleteTask", // asks first: the Delete review is the question; only a validated delete discards the draft
            "TodoModel.swift write", // asks first: navigate(.move)
            "TodoModel.swift write", // asks first: the Task moved to another Profile by that Move
        ])
    }

    @Test func everyPlaceTheEditorIsReplacedIsKnown() throws {
        #expect(try sites(#"(?<!func )\bbeginEditing\("#) == [
            "Discovery.swift applyDiscoveryShow", // asks first: navigate(.showDiscovery)
            "TodoModel.swift create", // asks first when unsaved (pendingNavigation = .edit)
            "TodoModel.swift discardAndNavigate", // the answer Discard
            "TodoModel.swift applyNavigation", // edit, move, copy, openTransfer: each asked first
            "TodoModel.swift applyNavigation",
            "TodoModel.swift applyNavigation",
            "TodoModel.swift applyNavigation",
            "TodoModel.swift saveSeries", // the editor's own Series save
        ])
    }

    @Test func noViewClearsTheEditorItself() throws {
        for name in try files() where name != "TodoModel.swift" && name != "Discovery.swift" {
            #expect(try code(name).range(of: #"\.editor\s*=\s*nil"#, options: .regularExpression) == nil, "\(name) clears the editor without the question")
        }
    }

    @Test func everyCloseButtonGoesThroughTheQuestion() throws {
        let views = try code("AppViews.swift"), editor = try code("EditorView.swift")
        let closeInspector = try #require(views.range(of: #"private func closeInspector\(\) \{[^}]*\}"#, options: .regularExpression))
        #expect(views[closeInspector].contains("model.closeEditor()"))
        // The toolbar's Inspector button and Compact's back button.
        #expect(views.contains("if model.editor != nil { closeInspector() } else { _ = openSelection() }"))
        #expect(views.range(of: #"Button \{ closeInspector\(\) \} label: \{\s*Label\("Back to tasks""#, options: .regularExpression) != nil)
        // The binding the system sets when it dismisses the inspector, and Escape in both windows.
        #expect(views.contains("set: { if !$0 && !model.busy { closeInspector() } }"))
        #expect(views.contains(".onExitCommand { if !model.busy { closeInspector() } }"))
        #expect(views.contains("if model.quickAdd { model.quickAdd = false } else { closeInspector() }"))
        // The editor's Close button (Escape's cancel shortcut).
        #expect(editor.contains("model.clientDiagnosticsUI.performSync(.closeInspector) { _ = model.closeEditor() }"))
    }
}

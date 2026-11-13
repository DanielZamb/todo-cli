import Foundation
import Testing
@testable import TodoState

/// The one message rule (MAC-C1-S1-09, S1-15), as every surface uses it.
@Suite struct SurfaceMessagesTests {
    enum Kind: Hashable { case a, b }
    @Test func anOlderSuccessAfterANewerFailureLeavesTheFailureAndPresentsNothing() {
        var messages = SurfaceMessages<Kind, String>()
        let older = messages.begin(.a), newer = messages.begin(.a)
        let newerPublished = messages.fail("newer failed", newer)
        let olderPresents = messages.succeed(older)
        #expect(newerPublished)
        #expect(!olderPresents, "superseded: presents nothing")
        #expect(messages.value == "newer failed")
    }
    @Test func anOlderFailureAfterANewerSuccessPublishesNothing() {
        var messages = SurfaceMessages<Kind, String>()
        let older = messages.begin(.a), newer = messages.begin(.a)
        let newerPresents = messages.succeed(newer)
        let olderPublished = messages.fail("older failed", older)
        #expect(newerPresents)
        #expect(!olderPublished)
        #expect(messages.value == nil)
    }
    @Test func anOlderSuccessAfterANewerSuccessPresentsNothing() {
        var messages = SurfaceMessages<Kind, String>()
        let older = messages.begin(.a), newer = messages.begin(.a)
        let newerPresents = messages.succeed(newer)
        let olderPresents = messages.succeed(older)
        #expect(newerPresents)
        #expect(!olderPresents)
    }
    @Test func aSuccessClearsOnlyItsOwnKindFromBeforeItBegan() {
        var messages = SurfaceMessages<Kind, String>()
        messages.publish("b before", kind: .b)
        let action = messages.begin(.a)
        let first = messages.succeed(action)
        #expect(first && messages.value == "b before", "another kind stays")
        messages.publish("a before", kind: .a)
        let second = messages.begin(.a)
        let secondPresents = messages.succeed(second)
        #expect(secondPresents && messages.value == nil, "its own kind from before it began ends")
        let third = messages.begin(.a)
        messages.publish("a after", kind: .a)
        let thirdPresents = messages.succeed(third)
        #expect(thirdPresents && messages.value == "a after", "one published after it began survives")
    }
    @Test func aTicketFromAnEarlierInstanceIsNeverNewest() {
        var messages = SurfaceMessages<Kind, String>()
        let old = messages.begin(.a)
        messages = .init()
        let current = messages.begin(.a)
        #expect(!messages.isNewest(old) && messages.isNewest(current))
        let oldPublished = messages.fail("old instance", old)
        #expect(!oldPublished && messages.value == nil)
    }

    // D1: supersession is per target, not per kind.
    @Test func actionsOnDifferentTargetsAreBothLive() {
        var messages = SurfaceMessages<Kind, String>()
        let a = messages.begin(.a, target: "row A"), b = messages.begin(.a, target: "row B")
        #expect(messages.isNewest(a) && messages.isNewest(b), "a tick on another row does not supersede")
        let published = messages.fail("A refused", a)
        #expect(published && messages.value == "A refused")
    }
    @Test func aNewerActionOnTheSameTargetSupersedesTheOlder() {
        var messages = SurfaceMessages<Kind, String>()
        let older = messages.begin(.a, target: "row A"), newer = messages.begin(.a, target: "row A")
        let olderPublished = messages.fail("older", older)
        #expect(!olderPublished && messages.isNewest(newer) && messages.value == nil)
    }
    // A navigation (coordinator ruling, 2026-11-12): superseded across rows, its message ends with its row.
    @Test func aNavigationIsSupersededAcrossRowsButItsMessageEndsWithItsRow() {
        var messages = SurfaceMessages<Kind, String>()
        let older = messages.begin(.a), newer = messages.begin(.a)
        let olderPublished = messages.fail("row A", older, row: "row A")
        #expect(!olderPublished && messages.value == nil, "the older navigation, for another row, presents nothing")
        let newerPublished = messages.fail("row B", newer, row: "row B")
        #expect(newerPublished && messages.value == "row B")
        messages.clear([.a], onlyTarget: "row A")
        #expect(messages.value == "row B", "an action on another row leaves it")
        messages.clear([.a], onlyTarget: "row B")
        #expect(messages.value == nil, "an action on its row ends it")
    }
    // D2: same-kind failures on different targets merge; another kind replaces.
    private func merged() -> SurfaceMessages<Kind, String> {
        .init(merge: { kind, parts in kind == .a ? "\(parts.count): " + MergedFailureWording.names(parts.map(\.subject)) : nil })
    }
    @Test func sameKindFailuresOnDifferentTargetsMerge() {
        var messages = merged()
        let a = messages.begin(.a, target: "A"), b = messages.begin(.a, target: "B")
        let first = messages.fail("A refused", a, subject: "Alpha")
        let second = messages.fail("B refused", b, subject: "Beta")
        #expect(first && second)
        #expect(messages.value == "2: \u{201C}Alpha\u{201D} and \u{201C}Beta\u{201D}", "\(messages.value ?? "nil")")
        // A's later success on its own row ends only its part.
        let retry = messages.begin(.a, target: "A")
        let presents = messages.succeed(retry)
        #expect(presents && messages.value == "B refused")
    }
    @Test func aDifferentKindStillReplaces() {
        var messages = merged()
        let a = messages.begin(.a, target: "A")
        _ = messages.fail("A refused", a, subject: "Alpha")
        messages.publish("other kind", kind: .b)
        #expect(messages.value == "other kind" && messages.kind == .b)
    }
    @Test func theMergedWordingNamesUpToThreeThenCounts() {
        #expect(MergedFailureWording.names(["A", "B", "C", "D", "E"]) == "\u{201C}A\u{201D}, \u{201C}B\u{201D}, \u{201C}C\u{201D} and 2 more")
        #expect(MergedFailureWording.names(["A", "B"]) == "\u{201C}A\u{201D} and \u{201C}B\u{201D}")
    }
    @Test func aSharedRefusalIsSaidOnceInThePluralAndDifferentOnesKeepTheGenericClose() {
        // Compared by code, not by sentence.
        #expect(MergedFailureWording.reason(codes: ["dependency_cycle", "dependency_cycle"], differing: "fallback") == "Each would create a loop. Choose other Tasks.")
        #expect(MergedFailureWording.reason(codes: ["dependency_cycle", "occ_conflict"], differing: "fallback") == "fallback")
        #expect(MergedFailureWording.reason(codes: [nil, nil], differing: "fallback") == "fallback")
    }
    /// The seat's final closing sentences (candidate 8 review, 2026-11-12), for every code a link
    /// can be refused with: the seat's sentence, or the "see why" fallback for codes two links rarely
    /// share. The coordinator's D2 rule, stated exactly: no merged reason is the single-Task sentence
    /// of its code (the sentence the picker shows for one refusal). A rule ("A Task can have at most
    /// 13…") or a fact about the credential is not one Task's outcome, so it may read singular.
    @Test(arguments: [
        ("dependency_cycle", "Each would create a loop. Choose other Tasks.", "This Dependency would create a loop."),
        ("too_many_dependencies", "A Task can have at most 13 direct Dependencies. Choose fewer.", "A Task can have at most 13 direct Dependencies.\n" + DependencyNotice.countAdvice(14)),
        ("blocked", "Done Tasks can only depend on done or cancelled Tasks.", "A done Task can only depend on done or cancelled Tasks."),
        ("blocks_done_task", "fallback", "This Task blocks done Tasks and can't be reopened."),
        ("dependency_profile_mismatch", "A Task and its Dependencies must be in the same Profile.", "A Task and its Dependency must be in the same Profile."),
        ("occ_conflict", "These Tasks changed. Reload and try again.", "This Task changed. Reload its Dependencies before trying again."),
        ("not_found", "These Tasks were deleted or moved.", "Task not found."),
        ("validation", "fallback", "Check this Dependency and try again."),
        ("invalid_args", "fallback", "Check this Dependency and try again."),
        ("forbidden", "This credential can't change Dependencies.", "This credential can't update Dependencies."),
        ("unauthorized", "fallback", "Your Session ended. Sign in again."),
        ("connection", "The server couldn't be reached. Try again.", "Couldn't update Dependencies. Try again."),
        ("unavailable", "The server couldn't be reached. Try again.", "Couldn't update Dependencies. Try again."),
    ])
    func aMergedReasonIsTheSeatsSentenceAndNeverItsCodesSingleTaskSentence(_ code: String, _ expected: String, _ single: String) {
        let reason = MergedFailureWording.reason(codes: [code, code], differing: "fallback")
        #expect(reason == expected, "\(code): \(reason)")
        #expect(reason != single && !reason.contains(single), "\(code): the merged reason is not the single-Task sentence \(single)")
    }

    /// The banner's merged hand-offs (seat, 2026-11-12): one verb and one shared Task read as the
    /// single hand-off does, in both directions; otherwise the picker's form.
    @Test func theBannersMergedHeadNamesASharedTaskAndUsesThePickersVerb() {
        func link(_ verb: String, _ dependent: String, _ blocker: String) -> LinkAttempt { .init(verb: verb, dependentID: dependent, dependent: dependent, blockerID: blocker, blocker: blocker) }
        func head(_ attempts: [LinkAttempt?], _ subjects: [String]) -> String { MergedFailureWording.linkHead(attempts, subjects: subjects) }
        // Depends on: the dependent R is shared.
        #expect(head([link("add", "R", "A"), link("add", "R", "B")], ["A", "B"]) == "Couldn't make \u{201C}R\u{201D} depend on \u{201C}A\u{201D} and \u{201C}B\u{201D}.")
        #expect(head([link("remove", "R", "A"), link("remove", "R", "B")], ["A", "B"]) == "Couldn't stop \u{201C}R\u{201D} depending on \u{201C}A\u{201D} and \u{201C}B\u{201D}.")
        // Blocks: the blocker R is shared.
        #expect(head([link("add", "A", "R"), link("add", "B", "R")], ["A", "B"]) == "Couldn't make \u{201C}A\u{201D} and \u{201C}B\u{201D} depend on \u{201C}R\u{201D}.")
        #expect(head([link("remove", "A", "R"), link("remove", "B", "R")], ["A", "B"]) == "Couldn't stop \u{201C}A\u{201D} and \u{201C}B\u{201D} depending on \u{201C}R\u{201D}.")
        // Mixed verbs, shared Task: the picker's form with "change".
        #expect(head([link("add", "A", "R"), link("remove", "B", "R")], ["A", "B"]) == "Couldn't change 2 Dependencies: \u{201C}A\u{201D} and \u{201C}B\u{201D}.")
        // No shared Task: the picker's form with the one verb, or "change".
        #expect(head([link("add", "A", "X"), link("add", "B", "Y")], ["A", "B"]) == "Couldn't add 2 Dependencies: \u{201C}A\u{201D} and \u{201C}B\u{201D}.")
        #expect(head([link("remove", "A", "X"), link("remove", "B", "Y")], ["A", "B"]) == "Couldn't remove 2 Dependencies: \u{201C}A\u{201D} and \u{201C}B\u{201D}.")
        #expect(head([link("add", "A", "X"), link("remove", "B", "Y")], ["A", "B"]) == "Couldn't change 2 Dependencies: \u{201C}A\u{201D} and \u{201C}B\u{201D}.")
        // Four Tasks sharing one: up to three named, then the count.
        #expect(head(["A", "B", "C", "D"].map { link("add", "R", $0) }, ["A", "B", "C", "D"]) == "Couldn't make \u{201C}R\u{201D} depend on \u{201C}A\u{201D}, \u{201C}B\u{201D}, \u{201C}C\u{201D} and 1 more.")
        // A part without its attempt: nothing is guessed.
        #expect(head([link("add", "R", "A"), nil], ["A", "B"]) == "Couldn't change 2 Dependencies: \u{201C}A\u{201D} and \u{201C}B\u{201D}.")
    }

    /// The limit the messages state is the contract's: every `too_many_dependencies` limit in the
    /// OpenAPI contract is an enum of exactly `DependencyContract.directDependencies`.
    @Test func theStatedDependencyLimitIsTheContracts() throws {
        let contract = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("API/Sources/TodoAPI/openapi.json")
        let root = try JSONSerialization.jsonObject(with: Data(contentsOf: contract))
        var limits: [[Int]] = []
        func walk(_ node: Any) {
            if let object = node as? [String: Any] {
                if let properties = object["properties"] as? [String: Any], let limit = properties["limit"] as? [String: Any],
                   let values = limit["enum"] as? [NSNumber], properties["dependent_id"] != nil { limits.append(values.map(\.intValue)) }
                object.values.forEach(walk)
            } else if let array = node as? [Any] { array.forEach(walk) }
        }
        walk(root)
        #expect(!limits.isEmpty && limits.allSatisfy { $0 == [DependencyContract.directDependencies] }, "\(limits)")
    }
}


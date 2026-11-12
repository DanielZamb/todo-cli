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
}


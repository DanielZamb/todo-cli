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
}

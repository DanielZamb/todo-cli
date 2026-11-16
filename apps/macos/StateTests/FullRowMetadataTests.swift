import Testing
@testable import TodoState

/// The full row's metadata line (UI seat on candidate 12): whole items in Compact's order, with a
/// separator between kinds; what does not fit is left out from the end and counted as "+N"
/// (the fitting itself is SwiftUI's ViewThatFits, as in Compact's CompactRowMetadata).
@Suite struct FullRowMetadataTests {
    private func line(_ items: [FullRowMetadata.Item]) -> String {
        items.indices.map { (FullRowMetadata.separated(items, before: $0) ? "· " : "") + items[$0].text }.joined(separator: " ")
    }

    /// Compact's order (UI seat on 370f6485): the dates first, then the Project, the Tags and the
    /// external id, so "+N" leaves out Tags before it would leave out a date.
    @Test func theDatesComeFirstSoTheyAreTheLastToBeLeftOut() {
        let items = FullRowMetadata.items(project: "Launch", tags: ["focus", "review"], due: "Tomorrow", overdue: true, external: "JIRA-12", scheduled: "Today")
        #expect(items == [.due("Tomorrow", overdue: true), .scheduled("Today"), .project("Launch"), .tag("focus"), .tag("review"), .external("JIRA-12")])
        #expect(line(items) == "Due Tomorrow · Scheduled Today · Launch · #focus #review JIRA-12")
        // What fits in three whole items keeps the dates and the Project.
        #expect(Array(items.prefix(3)) == [.due("Tomorrow", overdue: true), .scheduled("Today"), .project("Launch")])
    }

    @Test(arguments: [
        (nil, [], nil, nil, "Today", "Scheduled Today"),
        (nil, [], nil, "JIRA-12", "Today", "Scheduled Today JIRA-12"),
        ("Launch", [], nil, nil, "Today", "Scheduled Today · Launch"),
        (nil, ["focus", "review"], nil, nil, nil, "#focus #review"),
        (nil, ["focus"], "Tomorrow", nil, nil, "Due Tomorrow · #focus"),
        ("Launch", [], nil, "JIRA-12", nil, "Launch JIRA-12"),
    ] as [(String?, [String], String?, String?, String?, String)])
    func aSeparatorStandsBetweenKindsNeverBetweenTagsOrBeforeTheExternalID(_ project: String?, _ tags: [String], _ due: String?, _ external: String?, _ scheduled: String?, _ expected: String) {
        #expect(line(FullRowMetadata.items(project: project, tags: tags, due: due, overdue: false, external: external, scheduled: scheduled)) == expected)
    }

    @Test func noItemsDrawsNothing() {
        #expect(FullRowMetadata.items(project: nil, tags: [], due: nil, overdue: false, external: nil, scheduled: nil).isEmpty)
    }
}

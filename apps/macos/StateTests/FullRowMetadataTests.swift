import Testing
@testable import TodoState

/// The full row's metadata line (UI seat on candidate 12): whole items, in the row's order, with the
/// separators the row drew before; what does not fit is left out from the end and counted as "+N"
/// (the fitting itself is SwiftUI's ViewThatFits, as in Compact's CompactRowMetadata).
@Suite struct FullRowMetadataTests {
    private func line(_ items: [FullRowMetadata.Item]) -> String {
        items.indices.map { (FullRowMetadata.separated(items, before: $0) ? "· " : "") + items[$0].text }.joined(separator: " ")
    }

    @Test func theItemsKeepTheRowsOrder() {
        let items = FullRowMetadata.items(project: "Launch", tags: ["focus", "review"], due: "Tomorrow", overdue: true, external: "JIRA-12", scheduled: "Today")
        #expect(items == [.project("Launch"), .tag("focus"), .tag("review"), .due("Tomorrow", overdue: true), .external("JIRA-12"), .scheduled("Today")])
        #expect(line(items) == "Launch · #focus #review · Due Tomorrow JIRA-12 · Scheduled Today")
    }

    @Test(arguments: [
        (nil, [], nil, nil, "Today", "Scheduled Today"),
        (nil, [], nil, "JIRA-12", "Today", "JIRA-12 Scheduled Today"),
        ("Launch", [], nil, nil, "Today", "Launch · Scheduled Today"),
        (nil, ["focus", "review"], nil, nil, nil, "#focus #review"),
        (nil, ["focus"], "Tomorrow", nil, nil, "#focus · Due Tomorrow"),
        ("Launch", [], nil, "JIRA-12", nil, "Launch JIRA-12"),
    ] as [(String?, [String], String?, String?, String?, String)])
    func theSeparatorsAreTheOnesTheRowDrewBefore(_ project: String?, _ tags: [String], _ due: String?, _ external: String?, _ scheduled: String?, _ expected: String) {
        #expect(line(FullRowMetadata.items(project: project, tags: tags, due: due, overdue: false, external: external, scheduled: scheduled)) == expected)
    }

    @Test func noItemsDrawsNothing() {
        #expect(FullRowMetadata.items(project: nil, tags: [], due: nil, overdue: false, external: nil, scheduled: nil).isEmpty)
    }
}

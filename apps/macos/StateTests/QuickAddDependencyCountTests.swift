import Testing
@testable import TodoState

/// UI check, c10, item 1: in Compact Quick Add, when any Dependency chip is out of view the
/// "Depends on" line says how many there are; otherwise it is unchanged.
@Suite struct QuickAddDependencyCountTests {
    @Test func theLineCountsTheDependenciesOnlyWhenSomeAreOutOfView() {
        #expect(InitialDependencySelection.heading(count: 13, cut: true) == "Depends on 13 Tasks")
        #expect(InitialDependencySelection.heading(count: 1, cut: true) == "Depends on 1 Task")
        #expect(InitialDependencySelection.heading(count: 13, cut: false) == "Depends on")
        #expect(InitialDependencySelection.heading(count: 0, cut: true) == "Depends on")
    }
}

import Foundation
import Testing
import TodoAPI
@testable import TodoState

@MainActor
struct RefreshMeasurementTests {
    @Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_REFRESH_SERVER"] != nil))
    func refreshMeasurement() async throws {
        let server = try #require(ProcessInfo.processInfo.environment["TODO_REFRESH_SERVER"].flatMap(URL.init(string:)))
        let credential = try await todoClient(server: server, credential: "").signIn_period_signIn(body: .json(.init(passphrase: "scratch verification passphrase"))).ok.body.json.credential
        let model = TodoModel(configuration: .init(server: server, initialProfile: "work", vaultService: "unused-refresh-measurement"), clientFactory: { url, _ in todoClient(server: url, credential: credential) })
        model.signedIn = true
        model.connection = .live
        func marker(_ action: String, _ name: String) async throws {
            var url = server.appending(path: "__measurement/\(action)")
            url.append(queryItems: [.init(name: "name", value: name)])
            _ = try await URLSession.shared.data(from: url)
        }
        for view in ["all", "today", "overdue", "scheduled", "inbox"] {
            model.selectedView = view
            model.searchText = ""
            try await marker("start", "full-\(view)")
            await model.refreshAfterWrite("Measurement full refresh")
            try await marker("end", "full-\(view)")
            #expect(model.searchPhase == .showing)
            for index in -1..<1 {
                for action in ["text", "apply", "clear", "retry", "text-again"] {
                    let name = "\(index == -1 ? "warmup" : "query")-\(view)-\(index)-\(action)"
                    try await marker("start", name)
                    switch action {
                    case "apply": model.applyTaskFilters(.init(priority: "P1"))
                    case "clear": model.setSearchText(""); model.applyTaskFilters(.init())
                    case "text": model.setSearchText("ref")
                    case "text-again": model.setSearchText("refresh")
                    default: #expect(await model.retrySearch() == .applied)
                    }
                    for _ in 0..<6000 {
                        if model.searchPhase == .showing && model.appliedSearchSnapshot?.appliedIdentity == model.requestedIdentity { break }
                        try await Task.sleep(for: .milliseconds(10))
                    }
                    #expect(model.searchPhase == .showing)
                    #expect(model.appliedSearchSnapshot?.appliedIdentity == model.requestedIdentity)
                    #expect(!model.searchStale)
                    let rows = try #require(model.appliedSearchSnapshot?.rows)
                    let expected: [String]
                    switch view {
                    case "all": expected = ["Refresh Inbox", "Refresh Today", "Refresh Overdue", "Refresh Scheduled"]
                    case "today": expected = ["Refresh Overdue", "Refresh Today"]
                    case "overdue": expected = ["Refresh Overdue"]
                    case "scheduled": expected = ["Refresh Today", "Refresh Scheduled"]
                    default: expected = ["Refresh Inbox"]
                    }
                    #expect(rows.map(\.title).sorted() == expected.sorted())
                    for row in rows where !model.searchText.isEmpty {
                        #expect(row.search_matches == [.init(field: .title, start: 0, end: 7)])
                    }
                    #expect(model.tasks.count == 4)
                    try await marker("end", name)
                }
            }
        }
    }
}

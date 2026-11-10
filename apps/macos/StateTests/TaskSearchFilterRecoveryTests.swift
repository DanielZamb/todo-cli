import Foundation
import Testing
import TodoAPI
import HTTPTypes
import OpenAPIRuntime
import OpenAPIURLSession
@testable import TodoState

private actor ScopedSearchTransport: ClientTransport {
    private let live = URLSessionTransport()
    private var syntheticProjects = false
    private(set) var reads: [(path: String, data: Data)] = []
    func useSyntheticSameNameProjects() { syntheticProjects = true }
    func latestSearch() -> (path: String, data: Data)? {
        reads.last { URLComponents(string: $0.path)?.queryItems?.contains { $0.name == "text" } == true }
    }
    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        var forwarded = request
        if syntheticProjects, operationID == "tasks.list", let path = request.path, var url = URLComponents(string: path) {
            url.queryItems = url.queryItems?.filter { $0.name != "project" }
            forwarded.path = url.string
        }
        let response = try await live.send(forwarded, body: body, baseURL: baseURL, operationID: operationID)
        guard operationID == "tasks.list" || operationID == "reads.projects", let body = response.1 else { return response }
        var data = try await Data(collecting: body, upTo: 4_000_000)
        if syntheticProjects, operationID == "reads.projects", response.0.status.code == 200 {
            var rows = try #require(JSONSerialization.jsonObject(with: data) as? [[String: Any]])
            for index in rows.indices where rows[index]["name"] as? String == "Other" { rows[index]["name"] = "Small" }
            data = try JSONSerialization.data(withJSONObject: rows, options: [.sortedKeys])
        }
        if operationID == "tasks.list" { reads.append((request.path ?? "", data)) }
        return (response.0, HTTPBody(String(decoding: data, as: UTF8.self)))
    }
}

@MainActor
struct TaskSearchFilterRecoveryTests {
    private func canonicalRows(_ data: Data, id: String) throws -> Data {
        let rows = try #require(JSONSerialization.jsonObject(with: data) as? [[String: Any]])
        return try JSONSerialization.data(withJSONObject: rows.filter { $0["id"] as? String == id }, options: [.sortedKeys])
    }
    private func runCLI(_ arguments: [String]) throws -> Data {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: try #require(ProcessInfo.processInfo.environment["TODO_F10_CLI"]))
        process.arguments = arguments
        process.environment = ProcessInfo.processInfo.environment
        let output = Pipe()
        process.standardOutput = output
        process.standardError = Pipe()
        try process.run()
        let data = output.fileHandleForReading.readDataToEndOfFile()
        process.waitUntilExit()
        #expect(process.terminationStatus == 0)
        return data
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_W06_SERVER"] != nil))
    func filterRecoveryPreservesOrdinaryRowsWithRawAppendCaseFoldTagsAndSyntheticSameNameProjects() async throws {
        let server = try #require(ProcessInfo.processInfo.environment["TODO_W06_SERVER"].flatMap(URL.init(string:)))
        let credential = try await todoClient(server: server, credential: "").signIn_period_signIn(body: .json(.init(passphrase: "scratch verification passphrase"))).ok.body.json.credential
        let direct = todoClient(server: server, credential: credential)
        let profile = "zzz-f1-\(UUID().uuidString.lowercased())"
        _ = try runCLI(["init", "--profile", profile])
        var tasks: [TaskSnapshot] = []
        for index in 0..<3 {
            let data = try JSONSerialization.data(withJSONObject: ["title": "Scope probe \(index)", "description": "ordinary", "project_name": index == 0 ? "Small" : "Other", "tag_names": [index == 0 ? "keep" : "other"]])
            let payload = try JSONDecoder().decode(Operations.tasks_period_create.Input.Body.jsonPayload.self, from: data)
            tasks.append(try await TaskSnapshot.decode(direct.tasks_period_create(path: .init(profile: profile), body: .json(payload)).ok.body.json))
        }
        let selected = try #require(tasks.first)
        let transport = ScopedSearchTransport()
        let model = TodoModel(configuration: .init(server: server, initialProfile: profile, vaultService: "unused-f1-\(UUID())"), clientFactory: { url, _ in
            Client(serverURL: url, transport: transport, middlewares: [BearerMiddleware(credential: credential)])
        })
        model.selectedView = "all"
        model.signedIn = true
        model.connection = .live
        defer { model.signedIn = false; model.connect() }
        model.setSearchText("probe")
        #expect(await model.retrySearch() == .applied)
        let ordinary = try #require(await transport.latestSearch())
        for project in [true, false] {
            for full in [false, true] {
                model.selectedProject = project ? selected.project_id : nil
                model.selectedTag = project ? nil : selected.tags.first
                if full { await model.refreshAfterWrite("F1 full-path proof") }
                else { #expect(await model.retrySearch() == .applied) }
                #expect(model.appliedSearchSnapshot?.rows.map(\.title) == ["Scope probe 0"])
                #expect(model.appliedSearchSnapshot?.rows.first?.search_matches == [.init(field: .title, start: 6, end: 11)])
                let after = try #require(await transport.latestSearch())
                #expect(try canonicalRows(after.data, id: selected.id) == canonicalRows(ordinary.data, id: selected.id))
                #expect(URLComponents(string: after.path)?.queryItems?.contains { $0.name == (project ? "project" : "tag") && $0.value == (project ? "Small" : "keep") } == true)
            }
        }
        for task in tasks {
            let data = try JSONSerialization.data(withJSONObject: ["from_version": 1, "changes": ["description": String(repeating: "\u{FDFA}", count: 100000)]])
            let payload = try JSONDecoder().decode(Operations.tasks_period_edit.Input.Body.jsonPayload.self, from: data)
            _ = try await direct.tasks_period_edit(path: .init(profile: profile, task: task.id), body: .json(payload)).ok
        }
        model.selectedProject = nil
        model.selectedTag = nil
        #expect(await model.retrySearch() == .failed)
        #expect(model.searchError?.canRetry == false)
        for project in [true, false] {
            for full in [false, true] {
                model.selectedProject = project ? selected.project_id : nil
                model.selectedTag = project ? nil : selected.tags.first
                if full { await model.refreshAfterWrite("F1 full-path recovery proof") }
                else { #expect(await model.retrySearch() == .applied) }
                #expect(model.searchError == nil)
                #expect(model.appliedSearchSnapshot?.rows.map(\.title) == ["Scope probe 0"])
                #expect(model.appliedSearchSnapshot?.rows.first?.search_matches == [.init(field: .title, start: 6, end: 11)])
                let read = try #require(await transport.latestSearch())
                let query = URLComponents(string: read.path)?.queryItems ?? []
                #expect(query.contains { $0.name == (project ? "project" : "tag") && $0.value == (project ? "Small" : "keep") })
            }
        }
        for project in [true, false] {
            model.selectView("all")
            #expect(model.searchText == "probe")
            #expect(model.projects.contains { $0.id == selected.project_id && $0.name == "Small" })
            #expect(model.tags.contains { $0.id == selected.tags.first && $0.name == "keep" })
            if project { model.selectedProject = selected.project_id } else { model.selectedTag = selected.tags.first }
            for _ in 0..<1500 where model.searchPhase != .showing && model.searchPhase != .error {
                try await Task.sleep(for: .milliseconds(20))
            }
            #expect(model.searchPhase == .showing)
            #expect(model.searchError == nil)
            #expect(model.appliedSearchSnapshot?.rows.map(\.title) == ["Scope probe 0"])
            let read = try #require(await transport.latestSearch())
            #expect(URLComponents(string: read.path)?.queryItems?.contains { $0.name == (project ? "project" : "tag") && $0.value == (project ? "Small" : "keep") } == true)
        }
        model.selectView("all")
        for task in tasks {
            let payload = try JSONDecoder().decode(Operations.tasks_period_edit.Input.Body.jsonPayload.self, from: Data(#"{"from_version":2,"changes":{"description":"ordinary"}}"#.utf8))
            _ = try await direct.tasks_period_edit(path: .init(profile: profile, task: task.id), body: .json(payload)).ok
        }
        let seed = Process()
        seed.executableURL = URL(fileURLWithPath: try #require(ProcessInfo.processInfo.environment["SEC_SEARCH_RECOVERY_SEED"]))
        seed.arguments = [profile]
        seed.environment = ProcessInfo.processInfo.environment
        let output = Pipe()
        seed.standardOutput = output
        seed.standardError = Pipe()
        try seed.run()
        _ = output.fileHandleForReading.readDataToEndOfFile()
        seed.waitUntilExit()
        #expect(seed.terminationStatus == 0)
        model.selectedProject = nil
        model.selectedTag = nil
        model.setSearchText("collision")
        #expect(await model.retrySearch() == .applied)
        let collisions = try #require(model.appliedSearchSnapshot?.rows)
        #expect(collisions.map(\.title).sorted() == ["Collision probe 0", "Collision probe 1"])
        let collisionJSON = try #require(await transport.latestSearch())
        for row in collisions {
            model.selectedTag = try #require(row.tags.first)
            #expect(await model.retrySearch() == .applied)
            #expect(model.appliedSearchSnapshot?.rows.map(\.title) == [row.title])
            #expect(model.appliedSearchSnapshot?.rows.first?.search_matches == [.init(field: .title, start: 0, end: 9)])
            let after = try #require(await transport.latestSearch())
            let serverRows = try #require(JSONSerialization.jsonObject(with: after.data) as? [[String: Any]])
            #expect(serverRows.count == 2)
            #expect(try canonicalRows(after.data, id: row.id) == canonicalRows(collisionJSON.data, id: row.id))
        }
        model.selectedTag = nil
        await transport.useSyntheticSameNameProjects()
        await model.refreshAfterWrite("Synthetic Project catalog changed")
        #expect(model.searchError == nil)
        #expect(model.projects.filter { $0.name == "Small" }.count == 2)
        for row in collisions {
            model.selectedProject = row.project_id
            #expect(await model.retrySearch() == .applied)
            #expect(model.appliedSearchSnapshot?.rows.map(\.title) == [row.title])
            #expect(model.appliedSearchSnapshot?.rows.first?.search_matches == [.init(field: .title, start: 0, end: 9)])
            #expect(model.appliedSearchSnapshot?.appliedIdentity.project == row.project_id)
            let after = try #require(await transport.latestSearch())
            let serverRows = try #require(JSONSerialization.jsonObject(with: after.data) as? [[String: Any]])
            #expect(serverRows.count == 2)
            #expect(URLComponents(string: after.path)?.queryItems?.contains { $0.name == "project" && $0.value == "Small" } == true)
            #expect(try canonicalRows(after.data, id: row.id) == canonicalRows(collisionJSON.data, id: row.id))
        }
        let paddedSeed = Process()
        paddedSeed.executableURL = URL(fileURLWithPath: try #require(ProcessInfo.processInfo.environment["SEC_SEARCH_RECOVERY_SEED"]))
        paddedSeed.arguments = [profile, "padded"]
        paddedSeed.environment = ProcessInfo.processInfo.environment
        let paddedOutput = Pipe()
        paddedSeed.standardOutput = paddedOutput
        paddedSeed.standardError = Pipe()
        try paddedSeed.run()
        _ = paddedOutput.fileHandleForReading.readDataToEndOfFile()
        paddedSeed.waitUntilExit()
        #expect(paddedSeed.terminationStatus == 0)
        model.selectedProject = nil
        model.selectedTag = nil
        model.setSearchText("padded")
        await model.refreshAfterWrite("Padded Tag fixture catalog changed")
        #expect(model.searchError == nil)
        #expect(model.appliedSearchSnapshot?.rows.map(\.title) == ["Padded marker"])
        let paddedTag = try #require(model.tags.first { $0.name == " keep " }?.id)
        model.selectedTag = paddedTag
        for full in [false, true] {
            if full { await model.refreshAfterWrite("Padded Tag full-path proof") }
            else { #expect(await model.retrySearch() == .applied) }
            #expect(model.searchError == nil)
            #expect(model.appliedSearchSnapshot?.rows.map(\.title) == ["Padded marker"])
            let paddedRead = try #require(await transport.latestSearch())
            #expect(URLComponents(string: paddedRead.path)?.queryItems?.contains { $0.name == "tag" } == false)
        }
        if let path = ProcessInfo.processInfo.environment["TODO_W06_RECEIPT"] {
            try JSONSerialization.data(withJSONObject: ["fullAndQueryPaths": true, "projectRecovery": true, "tagRecovery": true, "navigationRecovery": true, "paddedTagKeepsSelectedRow": true, "ordinaryRowsAndSpansByteIdentical": true, "rawAppendOrOldDataCaseFoldTagSuperset": true, "syntheticSameNameProjectSuperset": true]).write(to: URL(fileURLWithPath: path).deletingLastPathComponent().appendingPathComponent("search-filter-recovery.json"))
        }
    }
}

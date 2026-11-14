import Foundation
import Testing
@testable import TodoAPI
@testable import TodoState
import HTTPTypes
import OpenAPIRuntime

@MainActor @Suite(.serialized) struct SeatCandidate7InlineInterleavingTests {
    private var server: URL { URL(string: ProcessInfo.processInfo.environment["SEAT_SERVER"]!)! }
    private func wait(_ check: () async -> Bool) async throws {
        for _ in 0..<2000 { if await check() { return }; try await Task.sleep(for: .milliseconds(5)) }
        throw URLError(.timedOut)
    }
    private func save(_ name: String, _ object: [String: Any]) throws {
        try JSONSerialization.data(withJSONObject: object, options: [.prettyPrinted, .sortedKeys]).write(to: URL(fileURLWithPath: ProcessInfo.processInfo.environment["SEAT_EVIDENCE"]!).appendingPathComponent(name + ".json"))
    }
    private func live() async throws -> (TodoModel, SeatCandidate7Gate, TodoClientSession) {
        let anonymous = TodoClientSession(server: server, credential: "")
        let token = try await anonymous.client.signIn_period_signIn(body: .json(.init(passphrase: "scratch verification passphrase"))).ok.body.json.credential
        anonymous.invalidate()
        let owner = TodoClientSession(server: server, credential: token)
        let gate = SeatCandidate7Gate()
        let model = TodoModel(configuration: .init(server: server, initialProfile: "work", vaultService: "memory-c7-" + UUID().uuidString), clientFactory: { url, token in Client(serverURL: url, transport: gate, middlewares: [BearerMiddleware(credential: token)]) }, clientDiagnostics: .disabled, catalogNotifications: NotificationCenter(), wakeNotifications: NotificationCenter())
        try SessionVault(service: model.configuration.vaultService, account: server.absoluteString).save(token)
        model.replaceCredential(token); model.signedIn = true; model.connection = .live; model.selectedView = "all"; model.clientDiagnosticsUI.stop()
        await model.refreshAfterWrite("Initial")
        try #require(model.canWrite && !model.tasks.isEmpty)
        return (model, gate, owner)
    }
    private func finish(_ model: TodoModel, _ gate: SeatCandidate7Gate, _ owner: TodoClientSession) async {
        model.signedIn = false; model.replaceCredential(""); await gate.stop(); owner.invalidate()
    }
    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func anOlderImportFollowUpMustNotEraseANewerInReportFailure() async throws {
        let (m,g,owner) = try await live()
        m.showingImport = true
        m.loadImport(data: Data("[{\"title\":\"Report remains open\"}]".utf8), name: "report.json")
        await m.previewImport()
        let opening = m.importInstance
        let target = try #require(m.tasks.first)
        await g.arm("tasks.show")
        let older = Task { await m.createDependencyFollowUp(target.id) }
        try await wait { await g.waiting("tasks.show") }
        await g.fail("tasks.show", status: 404)
        await m.createDependencyFollowUp(UUID().uuidString)
        let newer = try #require(m.importFollowUpError)
        #expect(m.message == nil)
        await g.release("tasks.show"); await older.value
        try save("import-followup-interleaving", ["before_old_success": newer, "after_old_success": m.importFollowUpError ?? NSNull(), "same_report_open": m.showingImport && m.importInstance == opening && m.importReport != nil, "quick_add_opened": m.quickAdd])
        #expect(m.importFollowUpError == newer)
        #expect(m.showingImport && m.importInstance == opening && m.importReport != nil)
        await finish(m,g,owner)
    }
}

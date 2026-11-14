import Foundation
import Testing
@testable import TodoAPI
@testable import TodoState
import HTTPTypes
import OpenAPIRuntime

@MainActor @Suite(.serialized) struct SeatCandidate7bBoundaryTests {
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
    @Test(.enabled(if:ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil),arguments:[false,true])
    func aSupersededLinkCannotHandItsFailureToTheMainWindowAfterClose(newerFails:Bool) async throws {
        let(m,g,owner)=try await live()
        let api=owner.client
        let root=try TaskSnapshot.decode(await api.tasks_period_create(path:.init(profile:"work"),body:.json(.init(title:"Same picker root"))).ok.body.json)
        let first=try TaskSnapshot.decode(await api.tasks_period_create(path:.init(profile:"work"),body:.json(.init(title:"Older dependent"))).ok.body.json)
        let second=try TaskSnapshot.decode(await api.tasks_period_create(path:.init(profile:"work"),body:.json(.init(title:"Newer dependent"))).ok.body.json)
        m.dependencies.picker = .init(profile:"work",root:root,direction:.blocks)
        await m.reloadDependencyPicker()
        await g.arm("tasks.depend",status:503,label:"SUPERSEDED older link")
        let older=Task{await m.toggleDependency(first)}
        try await wait{await g.waiting("tasks.depend")}
        try #require(m.canWrite && m.dependencies.picker?.pending.contains(first.id) == true)
        if newerFails {await g.fail("tasks.depend",status:503)}
        await m.toggleDependency(second)
        let newer=m.dependencies.picker?.failure?.message
        if newerFails {try #require(newer != nil)}
        else {try #require(m.dependencies.picker?.feedback == "Dependency added")}
        // Close is enabled during links; no busy or pending state is changed by this control.
        m.closeDependencyPicker()
        await g.release("tasks.depend");await older.value
        let shown=m.message
        try save("superseded-link-handoff-"+String(newerFails),["newer_failed":newerFails,"newer_notice":newer ?? NSNull(),"message":shown ?? NSNull(),"kind":m.messageKind.map{String(describing:$0)} ?? "nil","picker_closed":m.dependencies.picker == nil,"writable":m.canWrite])
        #expect(shown == nil)
        await finish(m,g,owner)
    }
}

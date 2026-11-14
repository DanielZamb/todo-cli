import Foundation
import Testing
@testable import TodoAPI
@testable import TodoState
import HTTPTypes
import OpenAPIRuntime

@MainActor @Suite(.serialized) struct SeatCandidate7cSupersessionTests {
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
    private func trio(_ api:Client) async throws -> (TaskSnapshot,TaskSnapshot,TaskSnapshot) {
      let root=try TaskSnapshot.decode(await api.tasks_period_create(path:.init(profile:"work"),body:.json(.init(title:"Root "+UUID().uuidString))).ok.body.json)
      let a=try TaskSnapshot.decode(await api.tasks_period_create(path:.init(profile:"work"),body:.json(.init(title:"Older dependent "+UUID().uuidString))).ok.body.json)
      let b=try TaskSnapshot.decode(await api.tasks_period_create(path:.init(profile:"work"),body:.json(.init(title:"Newer dependent "+UUID().uuidString))).ok.body.json)
      return(root,a,b)
    }
    @Test(.enabled(if:ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func supersessionDuringLinkReadbackMustBeRecheckedAfterTheAwait() async throws {
      let(m,g,owner)=try await live();let(root,a,b)=try await trio(owner.client)
      m.dependencies.picker = .init(profile:"work",root:root,direction:.blocks);await m.reloadDependencyPicker()
      await g.arm("reads.profiles",status:503,label:"A catalog readback")
      let older=Task{await m.toggleDependency(a)}
      try await wait{await g.waiting("reads.profiles")}
      try #require(m.canWrite && m.dependencies.picker?.loading == false)
      await g.fail("tasks.depend",status:503);await m.toggleDependency(b)
      let newer=try #require(m.dependencies.picker?.failure?.message)
      try #require(m.message == nil)
      await g.release("reads.profiles");await older.value
      try save("superseded-during-link-readback",["message":m.message ?? NSNull(),"newer_notice":newer,"notice_after":m.dependencies.picker?.failure?.message ?? NSNull(),"same_picker_open":m.dependencies.picker != nil,"connection":"\(m.connection)"])
      #expect(m.message == nil)
      #expect(m.dependencies.picker?.failure?.message == newer)
      await finish(m,g,owner)
    }
    @Test(.enabled(if:ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil),arguments:[false,true])
    func anOldInstancesCompletionCannotReplaceTheNewInstancesHandoff(olderFails:Bool) async throws {
      let(m,g,owner)=try await live();let api=owner.client;let(root,a,b)=try await trio(api)
      _ = try await api.tasks_period_depend(path:.init(profile:"work",task:b.id),body:.json(.init(blocker_id:root.id,from_version:b.row_version))).ok
      let bNow=try TaskSnapshot.decode(await api.tasks_period_show(path:.init(profile:"work",task:b.id)).ok.body.json)
      m.dependencies.picker = .init(profile:"work",root:root,direction:.blocks);await m.reloadDependencyPicker()
      let first=m.dependencies.picker!.id
      await g.arm("tasks.depend",after:!olderFails,status:olderFails ? 503:nil,label:"OLD instance")
      let older=Task{await m.toggleDependency(a)}
      try await wait{await g.waiting("tasks.depend")}
      m.closeDependencyPicker()
      m.dependencies.picker = .init(profile:"work",root:root,direction:.blocks);await m.reloadDependencyPicker()
      let second=m.dependencies.picker!.id;try #require(second != first)
      await g.arm("tasks.undepend",status:503,label:"NEW instance")
      let newer=Task{await m.toggleDependency(bNow)}
      try await wait{await g.waiting("tasks.undepend")}
      m.closeDependencyPicker();await g.release("tasks.undepend");await newer.value
      let newMessage=try #require(m.message);try #require(newMessage.contains(b.title))
      let sequence=m.messageSequence
      await g.release("tasks.depend");await older.value
      try save("reopened-instance-handoff-"+String(olderFails),["before":newMessage,"after":m.message ?? NSNull(),"sequence_before":sequence,"sequence_after":m.messageSequence,"older_failed":olderFails])
      #expect(m.message == newMessage && m.messageSequence == sequence)
      await finish(m,g,owner)
    }
    @Test(.enabled(if:ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func aSupersededCommittedLinkStillReadsBackExactlyOnceWithoutClearingAHandoff() async throws {
      let(m,g,owner)=try await live();let api=owner.client;let(root,a,b)=try await trio(api)
      m.dependencies.picker = .init(profile:"work",root:root,direction:.blocks);await m.reloadDependencyPicker()
      m.publishMessage("Earlier handoff",kind:.dependencyLink)
      let beforeHistory=try await api.reads_period_history(path:.init(profile:"work",task:a.id)).ok.body.json.count
      await g.arm("tasks.depend",after:true)
      let older=Task{await m.toggleDependency(a)}
      try await wait{await g.waiting("tasks.depend")}
      await g.fail("tasks.depend",status:503);await m.toggleDependency(b)
      let newer=try #require(m.dependencies.picker?.failure?.message)
      let before=await g.snapshot()
      await g.release("tasks.depend");await older.value
      let after=await g.snapshot()
      let canonical=try TaskSnapshot.decode(await api.tasks_period_show(path:.init(profile:"work",task:a.id)).ok.body.json)
      let afterHistory=try await api.reads_period_history(path:.init(profile:"work",task:a.id)).ok.body.json.count
      let reads=(after["reads.profiles"] ?? 0)-(before["reads.profiles"] ?? 0)
      try save("superseded-committed-data",["catalog_reads":reads,"history_delta":afterHistory-beforeHistory,"visible_matches":m.tasks.first{$0.id==a.id} == canonical,"message":m.message ?? NSNull(),"newer_notice_preserved":m.dependencies.picker?.failure?.message == newer])
      #expect(reads == 1 && afterHistory-beforeHistory == 1)
      #expect(m.tasks.first{$0.id==a.id} == canonical && canonical.depends_on?.contains(root.id) == true)
      #expect(m.message == "Earlier handoff" && m.dependencies.picker?.failure?.message == newer)
      await finish(m,g,owner)
    }
    @Test(.enabled(if:ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func supersessionDuringCreateReadbackRaisesNoReconnectMessageOrCapsule() async throws {
      let(m,g,owner)=try await live();m.selectedView="today";await m.refreshAfterWrite("Today")
      m.quickAdd=true;m.newTitle="Old committed create "+UUID().uuidString
      await g.arm("tasks.list",status:503,label:"create readback")
      let create=Task{await m.create(openEditor:false)}
      try await wait{await g.waiting("tasks.list")}
      // Like the worker's defensive control: busy gates a real second create, so begin only its ticket.
      let newer=m.quickAddMessages.begin(.create)
      m.quickAddMessages.fail("Newer create failure",newer)
      await g.release("tasks.list");let presented=await create.value
      try save("superseded-during-create-readback",["message":m.message ?? NSNull(),"capsule":m.deletionNotice ?? NSNull(),"presented":presented])
      #expect(m.message == nil && m.deletionNotice == nil && !presented)
      await finish(m,g,owner)
    }
}

private final class SeatPayloadSentinel {}
@MainActor @Suite struct SeatGenerationLifetimeTests {
  @Test func ticketsRetainOnlyBoundedGenerationMetadataAndNeverRevive() {
    typealias Messages=SurfaceMessages<String,SeatPayloadSentinel>
    var ticket:Messages.Ticket?
    weak var payload:SeatPayloadSentinel?
    weak var table:AnyObject?
    do {
      var messages:Messages? = .init()
      let value=SeatPayloadSentinel();payload=value
      messages!.publish(value,kind:"a")
      ticket=messages!.begin("a")
      table=Mirror(reflecting:ticket!).children.first{$0.label == "generations"}!.value as AnyObject
      for _ in 0..<10000 {_ = messages!.begin("a");_ = messages!.begin("b")}
      #expect(ticket?.isNewest == false)
      let dictionary=Mirror(reflecting:table!).children.first{$0.label == "newest"}!.value as! [String:Int]
      #expect(dictionary.count == 2 && dictionary["a"] == 10001 && dictionary["b"] == 10000)
      messages=nil
    }
    #expect(payload == nil && table != nil)
    var reopened=Messages();let newTicket=reopened.begin("a")
    #expect(!reopened.isNewest(ticket!) && reopened.isNewest(newTicket) && ticket?.isNewest == false)
    ticket=nil
    #expect(table == nil)
  }
}

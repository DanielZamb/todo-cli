import Foundation
import Testing
import TodoAPI
@testable import TodoState

/// MAC-C1-S1-36: the invariant every stream scenario ends with. Whenever `connection` reads live,
/// a stream for the current Profile, credential epoch and generation is running, and a Task another
/// client creates on the shown Profile appears within `seconds`. With `reminder`, a reminder that
/// fires after the scenario reaches delivery too (the test seam `reminderDelivery`, since a test
/// process cannot use the notification centre).
enum StreamLiveness {
    struct Result { let live: Bool; let streamFollows: Bool; let writeAppeared: Bool?; let reminderDelivered: Bool? }

    @MainActor
    static func check(_ model: TodoModel, server: URL, seconds: Double = 5, reminder: Bool = false) async throws -> Result {
        guard model.signedIn, model.connection == .live else { return Result(live: false, streamFollows: model.streamFollowsCurrentProfile, writeAppeared: nil, reminderDelivered: nil) }
        let follows = model.streamFollowsCurrentProfile
        let credential = try await todoClient(server: server, credential: "").signIn_period_signIn(body: .json(.init(passphrase: "scratch verification passphrase"))).ok.body.json.credential
        let api = todoClient(server: server, credential: credential)
        let profile = model.profile
        let title = "Liveness " + UUID().uuidString
        _ = try await api.tasks_period_create(path: .init(profile: profile), body: .json(.init(title: title)))
        let appeared = await until(seconds) { model.tasks.contains { $0.title == title } }
        var delivered: Bool?
        if reminder {
            var fired: [String] = []
            let previous = model.reminderDelivery
            model.reminderDelivery = { operation in fired.append(operation.event.task_id ?? "") }
            defer { model.reminderDelivery = previous }
            let due = ISO8601DateFormatter().string(from: Date().addingTimeInterval(2))
            let payload = try JSONDecoder().decode(Operations.tasks_period_create.Input.Body.jsonPayload.self, from: JSONSerialization.data(withJSONObject: [
                "title": "Liveness reminder " + UUID().uuidString, "due_at": ["kind": "instant", "utc": due, "time_zone": "UTC"]]))
            let created = try TaskSnapshot.decode(try await api.tasks_period_create(path: .init(profile: profile), body: .json(payload)).ok.body.json)
            delivered = await until(seconds + 5) { fired.contains(created.id) }
        }
        return Result(live: true, streamFollows: follows, writeAppeared: appeared, reminderDelivered: delivered)
    }

    /// Records the check as expectations; returns it for receipts.
    @MainActor @discardableResult
    static func expectFollows(_ model: TodoModel, server: URL, reminder: Bool = false, _ context: String, sourceLocation: SourceLocation = #_sourceLocation) async throws -> [String: Any] {
        let result = try await check(model, server: server, reminder: reminder)
        if result.live {
            #expect(result.streamFollows, "\(context): connection reads live but no stream follows the current Profile, epoch and generation", sourceLocation: sourceLocation)
            #expect(result.writeAppeared == true, "\(context): another client's write did not appear", sourceLocation: sourceLocation)
            if reminder { #expect(result.reminderDelivered == true, "\(context): a fired reminder was not delivered", sourceLocation: sourceLocation) }
        }
        return ["live": result.live, "stream_follows": result.streamFollows, "write_appeared": result.writeAppeared ?? NSNull(), "reminder_delivered": result.reminderDelivered ?? NSNull()]
    }

    @MainActor
    static func until(_ seconds: Double, _ condition: () -> Bool) async -> Bool {
        let deadline = ProcessInfo.processInfo.systemUptime + seconds
        while !condition() {
            if ProcessInfo.processInfo.systemUptime > deadline { return false }
            try? await Task.sleep(for: .milliseconds(10))
        }
        return true
    }
}

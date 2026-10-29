import Foundation
import TodoAPI

struct UnionProofFailure: Error { let message: String }
func require(_ condition: Bool, _ message: String) throws {
    if !condition { throw UnionProofFailure(message: message) }
}
func roundTripHistory(_ path: String) throws -> [NSDictionary] {
    let data = try Data(contentsOf: URL(fileURLWithPath: path))
    let wire = try JSONDecoder().decode(Operations.reads_period_history.Output.Ok.Body.jsonPayload.self, from: data)
    let expected = try JSONSerialization.jsonObject(with: data)
    let actual = try JSONSerialization.jsonObject(with: JSONEncoder().encode(wire))
    try require(actual as? NSArray == expected as? NSArray, "Generated History coding changed facts")
    guard let entries = expected as? [NSDictionary] else { throw UnionProofFailure(message: "Expected History array") }
    return entries
}
let arguments = CommandLine.arguments
try require(arguments.count == 4, "Pass real History, global SSE operations and all-kind fixture paths")
let history = try roundTripHistory(arguments[1])
var logicalKinds = Set<String>()
for entry in history {
    guard let event = entry["event"] as? NSDictionary, let kind = event["kind"] as? String else { throw UnionProofFailure(message: "Missing event kind") }
    logicalKinds.insert(kind == "TaskHistoryRedacted" ? event["original_kind"] as? String ?? kind : kind)
}
let required: Set<String> = ["TaskCreated", "TaskEdited", "TaskCompleted", "TaskCancelled", "TaskReopened", "TaskDeleted", "TaskReverted", "TaskMovedOut", "TaskMovedIn", "TaskAttemptRejected", "ReminderFired", "TaskPurged"]
try require(required.isSubset(of: logicalKinds), "Real History does not cover every observable Task kind")
try require(history.contains { $0["outcome"] as? String == "rejected" }, "Expected rejected attempt")
let globalData = try Data(contentsOf: URL(fileURLWithPath: arguments[2]))
guard let globals = try JSONSerialization.jsonObject(with: globalData) as? [NSDictionary] else { throw UnionProofFailure(message: "Expected SSE operations") }
var globalKinds = Set<String>()
for entry in globals {
    let data = try JSONSerialization.data(withJSONObject: entry)
    let wire = try JSONDecoder().decode(Components.Schemas.CommittedOperation.self, from: data)
    let actual = try JSONSerialization.jsonObject(with: JSONEncoder().encode(wire))
    try require(actual as? NSDictionary == entry, "Generated SSE coding changed facts")
    guard let event = entry["event"] as? NSDictionary, let kind = event["kind"] as? String else { throw UnionProofFailure(message: "Missing SSE event kind") }
    globalKinds.insert(kind)
}
try require(globalKinds == ["AuthChanged", "DatabaseRestored"], "Missing global operation kinds")
let fixture = try roundTripHistory(arguments[3])
try require(fixture.count == 18, "Expected every effect-port event kind")
let result: [String: Any] = ["status": "PASS", "real_history_entries": history.count, "logical_task_kinds": logicalKinds.sorted(), "global_operation_kinds": globalKinds.sorted(), "database_restored_source": "scratch operation store", "fixture_kinds": 18, "native_app_launched": false, "keychain_accessed": false]
print(String(decoding: try JSONSerialization.data(withJSONObject: result, options: [.sortedKeys]), as: UTF8.self))

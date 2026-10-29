import Foundation
import TodoAPI

struct ProofFailure: Error {
    let message: String
}

func require(_ condition: Bool, _ message: String) throws {
    if !condition { throw ProofFailure(message: message) }
}

func fields<Value: Encodable>(_ value: Value) throws -> NSDictionary {
    let object = try JSONSerialization.jsonObject(with: JSONEncoder().encode(value))
    guard let fields = object as? NSDictionary else { throw ProofFailure(message: "Expected object") }
    return fields
}

let arguments = CommandLine.arguments
try require(arguments.count == 2, "Pass a redacted scratch HTTP History receipt")
let data = try Data(contentsOf: URL(fileURLWithPath: arguments[1]))
let history = try JSONDecoder().decode(Operations.reads_period_history.Output.Ok.Body.jsonPayload.self, from: data)
let expected = try JSONSerialization.jsonObject(with: data)
guard let entries = expected as? [NSDictionary] else { throw ProofFailure(message: "Expected History array") }
try require(history.count == 4, "Expected four redacted History entries")
let encoded = try JSONSerialization.jsonObject(with: JSONEncoder().encode(history))
try require((encoded as? NSArray) == (expected as? NSArray), "Generated History coding changed facts")
var committed = 0
for entry in entries {
    guard let event = entry["event"] as? NSDictionary else { throw ProofFailure(message: "Missing event") }
    try require(event["kind"] as? String == "TaskHistoryRedacted", "Expected redacted event")
    if entry["outcome"] as? String == "committed" {
        let wire = try JSONSerialization.data(withJSONObject: entry)
        let operation = try JSONDecoder().decode(Components.Schemas.CommittedOperation.self, from: wire)
        try require(try fields(operation) == entry, "Generated SSE operation coding changed facts")
        committed += 1
    }
}
try require(committed == 3, "Expected three committed SSE operations")
let result: [String: Any] = ["result": "PASS", "history_entries": history.count, "committed_sse_operations": committed, "app_launched": false, "xctest_launched": false, "keychain_accessed": false]
print(String(decoding: try JSONSerialization.data(withJSONObject: result, options: [.sortedKeys]), as: UTF8.self))

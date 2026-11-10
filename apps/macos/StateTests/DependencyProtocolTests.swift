import Foundation
import Testing
@testable import TodoState

struct DependencyProtocolTests {
    private let prefix = #"{"v":1,"identity":{"profile":"work","root":"a","credentialEpoch":3,"request":4},"type":""#
    private func reply(_ suffix: String) throws -> DependencyGraphReply { try JSONDecoder().decode(DependencyGraphReply.self, from: Data((prefix + suffix).utf8)) }
    @Test func everyReplyHasATypedBranch() throws {
        #expect(try reply(#"ready"}"#).event == .ready)
        #expect(try reply(#"rendered","node_count":2}"#).event == .rendered(2))
        #expect(try reply(#"renderError","message":"Pele failed"}"#).event == .renderError("Pele failed"))
        #expect(try reply(#"activate","task_id":"a"}"#).event == .activate("a"))
        #expect(try reply(#"context","task_id":"a"}"#).event == .context("a"))
        #expect(try reply(#"focus","task_id":null}"#).event == .focus(nil))
        #expect(try reply(#"expand","task_id":"a"}"#).event == .expand("a"))
        #expect(try reply(#"viewport","x":12,"y":-3,"scale":1.5}"#).event == .viewport(.init(x: 12, y: -3, scale: 1.5)))
    }
    @Test func unknownMessagesAndInvalidViewportAreRejected() {
        for value in [#"select","task_id":"a"}"#, #"renderFailure","message":"failed"}"#, #"focus"}"#, #"viewport","x":0,"y":0,"scale":0}"#, #"rendered","node_count":-1}"#] {
            #expect(throws: (any Error).self) { try reply(value) }
        }
        #expect(throws: (any Error).self) {
            try JSONDecoder().decode(DependencyGraphReply.self, from: Data(#"{"v":2,"type":"ready","identity":{"profile":"work","root":"a","credentialEpoch":3,"request":4}}"#.utf8))
        }
    }
    @Test func scopeAndKnownMapFenceEveryAction() throws {
        let current = DependencyGraphIdentity(profile: "work", root: "a", credentialEpoch: 3, request: 4)
        #expect(try reply(#"activate","task_id":"a"}"#).isCurrent(current, knownIDs: ["a"]))
        #expect(try !reply(#"activate","task_id":"foreign"}"#).isCurrent(current, knownIDs: ["a"]))
        for identity in [DependencyGraphIdentity(profile: "other", root: "a", credentialEpoch: 3, request: 4), .init(profile: "work", root: "b", credentialEpoch: 3, request: 4), .init(profile: "work", root: "a", credentialEpoch: 4, request: 4), .init(profile: "work", root: "a", credentialEpoch: 3, request: 5)] {
            #expect(try !reply(#"ready"}"#).isCurrent(identity, knownIDs: ["a"]))
        }
    }
}

extension DependencyProtocolTests {
    @Test func renderOmitsFreshViewportAndKeepsRootTitleAndStateDistinctFromSelection() throws {
        let render = DependencyGraphRender(identity: .init(profile: "work", root: "a", credentialEpoch: 3, request: 4), root_id: "a", nodes: [.init(mermaid_id: "n0", task_id: "a", title: "Ship the client", state: .blocked), .init(mermaid_id: "n1", task_id: "b", title: "Review", state: .done)], mermaid: "flowchart TD", visible_ids: ["a", "b"], viewport: nil, selected_id: "b", focused_id: nil, theme: .init(mode: "dark", tokens: [:]), reduced_motion: true)
        let value = try #require(JSONSerialization.jsonObject(with: JSONEncoder().encode(render)) as? [String: Any])
        #expect(value["viewport"] == nil)
        #expect(value["root_id"] as? String == "a")
        #expect(value["selected_id"] as? String == "b")
        #expect(value["focused_id"] is NSNull)
        let nodes = try #require(value["nodes"] as? [[String: String]])
        #expect(nodes == [["mermaid_id": "n0", "task_id": "a", "title": "Ship the client", "state": "blocked"], ["mermaid_id": "n1", "task_id": "b", "title": "Review", "state": "done"]])
    }
}

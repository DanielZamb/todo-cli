import Foundation
import HTTPTypes
import OpenAPIRuntime
import OpenAPIURLSession
import Testing
@testable import TodoAPI
@testable import TodoState

actor SeatCandidate7Gate: ClientTransport {
    struct Rule: Sendable { let after: Bool; let status: Int?; let label: String }
    let session: URLSession
    let base: URLSessionTransport
    var rules: [String:[Rule]] = [:]
    var held: [String:CheckedContinuation<Void,Never>] = [:]
    var failNext: [String:Int] = [:]
    var counts: [String:Int] = [:]
    var streams: [AsyncThrowingStream<HTTPBody.ByteChunk,any Error>.Continuation] = []
    var active = 0
    var drains: [CheckedContinuation<Void,Never>] = []
    var stopped = false
    var realStream = false
    let stream: StreamTransport
    func useRealStream() { realStream = true }
    init() { let s = URLSession(configuration:.ephemeral); let raw=URLSessionTransport(configuration:.init(session:s)); session=s; base=raw; stream=StreamTransport(ordinary:raw,diagnostics:.disabled) }
    func arm(_ op:String, after:Bool = false, status:Int? = nil, label:String = "surface") { rules[op,default:[]].append(.init(after:after,status:status,label:label)) }
    func fail(_ op:String, status:Int=503) { failNext[op]=status }
    func waiting(_ op:String)->Bool { held[op] != nil }
    func release(_ op:String) { held.removeValue(forKey:op)?.resume() }
    func resetCounts() { counts = [:] }
    func snapshot()->[String:Int] { counts }
    func stop() async {
        stopped=true
        for key in Array(held.keys) { release(key) }
        for c in streams { c.finish() }
        if active > 0 { await withCheckedContinuation { drains.append($0) } }
        session.invalidateAndCancel()
    }
    private func failure(_ status:Int,_ label:String)->RequestFailure { .init(status:status,message:"OLD "+label+" failed",code:status == 401 ? "unauthorized":"unavailable") }
    func send(_ request:HTTPRequest,body:HTTPBody?,baseURL:URL,operationID:String) async throws -> (HTTPResponse,HTTPBody?) {
        guard !stopped else { throw CancellationError() }
        active += 1
        defer { active -= 1; if active == 0 { for d in drains { d.resume() }; drains=[] } }
        counts[operationID,default:0] += 1
        if let status=failNext.removeValue(forKey:operationID) { throw failure(status,"read-back") }
        var rule:Rule?
        if rules[operationID]?.isEmpty == false { rule=rules[operationID]?.removeFirst() }
        if let rule, !rule.after {
            await withCheckedContinuation { held[operationID]=$0 }
            if let status=rule.status { throw failure(status,rule.label) }
        }
        if operationID == "changes.stream", realStream { return try await stream.send(request,body:body,baseURL:baseURL,operationID:operationID) }
        if operationID == "changes.stream" {
            let p=AsyncThrowingStream<HTTPBody.ByteChunk,any Error>.makeStream(); streams.append(p.continuation)
            // Keep the reconnect pending, so a published read-back message cannot disappear in ready.
            return(HTTPResponse(status:.ok,headerFields:[.contentType:"text/event-stream"]),HTTPBody(p.stream,length:.unknown))
        }
        guard !stopped else { throw CancellationError() }
        let value=try await base.send(request,body:body,baseURL:baseURL,operationID:operationID)
        if let rule, rule.after { await withCheckedContinuation { held[operationID]=$0 }; if let status=rule.status { throw failure(status,rule.label) } }
        return value
    }
}


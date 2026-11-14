import Foundation
@MainActor enum PerfSelectionTrace {
    static var callback: Double?
    static var publication: Double?
    static var callbacks = 0
    static var listBodies = 0
    static var rowBodies = 0
    static func listBody() { listBodies += 1 }
    static func rowBody() { rowBodies += 1 }
    static var cpu: ClientCpuReading?
    private static let sampler = ClientCpuSampler()
    static func reset() { _ = sampler; callback = nil; publication = nil; cpu = nil; callbacks = 0; listBodies = 0; rowBodies = 0 }
    static func selected() { callbacks += 1; if callback == nil { callback = ProcessInfo.processInfo.systemUptime * 1000; cpu = sampler.read() } }
    static func published() { publication = ProcessInfo.processInfo.systemUptime * 1000 }
}

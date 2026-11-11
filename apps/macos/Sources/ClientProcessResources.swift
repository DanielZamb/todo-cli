import Darwin
import Foundation
import TodoAPI

struct ClientCpuReading: Sendable {
    let mainThreadCpuMS: Double?
    let processCpuMS: Double?
    func since(_ earlier: Self) -> Self {
        func delta(_ current: Double?, _ previous: Double?) -> Double? {
            guard let current, let previous, current.isFinite, previous.isFinite, current >= previous else { return nil }
            return current - previous
        }
        return .init(mainThreadCpuMS: delta(mainThreadCpuMS, earlier.mainThreadCpuMS), processCpuMS: delta(processCpuMS, earlier.processCpuMS))
    }
}

final class ClientCpuSampler: Sendable {
    private let mainThread: mach_port_t
    @MainActor init() { mainThread = mach_thread_self() }
    deinit { _ = mach_port_deallocate(mach_task_self_, mainThread) }
    func read() -> ClientCpuReading {
        var info = thread_basic_info_data_t()
        let capacity = MemoryLayout<thread_basic_info_data_t>.size / MemoryLayout<integer_t>.size
        var count = mach_msg_type_number_t(capacity)
        let result = withUnsafeMutablePointer(to: &info) { pointer in
            pointer.withMemoryRebound(to: integer_t.self, capacity: capacity) { thread_info(mainThread, thread_flavor_t(THREAD_BASIC_INFO), $0, &count) }
        }
        let main = result == KERN_SUCCESS ? Double(info.user_time.seconds + info.system_time.seconds) * 1000 + Double(info.user_time.microseconds + info.system_time.microseconds) / 1000 : nil
        var usage = rusage()
        let process = getrusage(RUSAGE_SELF, &usage) == 0 ? Double(usage.ru_utime.tv_sec + usage.ru_stime.tv_sec) * 1000 + Double(usage.ru_utime.tv_usec + usage.ru_stime.tv_usec) / 1000 : nil
        return .init(mainThreadCpuMS: main, processCpuMS: process)
    }
    static func hostLoad1m() -> Double? {
        var value = 0.0
        return getloadavg(&value, 1) == 1 && value.isFinite && value >= 0 ? value : nil
    }
}

struct ClientStallObservation: Sendable {
    let traceID: UUID
    let durationMS: Double
    let cpu: ClientCpuReading
    func event(run: UUID, hostLoad1m: Double?) -> ClientDiagnosticEvent {
        var event = ClientDiagnosticEvent(name: .stall, run: run)
        event.traceID = traceID; event.durationMS = durationMS
        event.mainThreadCpuMS = cpu.mainThreadCpuMS; event.processCpuMS = cpu.processCpuMS; event.hostLoad1m = hostLoad1m
        return event
    }
}

struct ClientProcessResources {
    static func read() -> ClientDiagnosticResources? {
        let start = ProcessInfo.processInfo.systemUptime
        guard let directory = opendir("/dev/fd") else { return nil }
        defer { closedir(directory) }
        let ownDescriptor = dirfd(directory)
        var descriptors = 0, sockets = 0
        while let entry = readdir(directory) {
            let nameCapacity = MemoryLayout.size(ofValue: entry.pointee.d_name)
            let name = withUnsafePointer(to: &entry.pointee.d_name) { value in
                value.withMemoryRebound(to: CChar.self, capacity: nameCapacity) { String(cString: $0) }
            }
            guard let descriptor = Int32(name), descriptor != ownDescriptor, fcntl(descriptor, F_GETFD) >= 0 else { continue }
            descriptors += 1
            var type: Int32 = 0, size = socklen_t(MemoryLayout<Int32>.size)
            guard getsockopt(descriptor, SOL_SOCKET, SO_TYPE, &type, &size) == 0, type == SOCK_STREAM else { continue }
            var address = sockaddr_storage(), length = socklen_t(MemoryLayout<sockaddr_storage>.size)
            let result = withUnsafeMutablePointer(to: &address) { value in value.withMemoryRebound(to: sockaddr.self, capacity: 1) { getsockname(descriptor, $0, &length) } }
            if result == 0 && (Int32(address.ss_family) == AF_INET || Int32(address.ss_family) == AF_INET6) { sockets += 1 }
        }
        var limits = rlimit()
        guard getrlimit(RLIMIT_NOFILE, &limits) == 0 else { return nil }
        return .init(descriptors: descriptors, sockets: sockets, softLimit: limits.rlim_cur, hardLimit: limits.rlim_max, samplerDescriptors: 1, sampleMS: (ProcessInfo.processInfo.systemUptime - start) * 1000)
    }
}

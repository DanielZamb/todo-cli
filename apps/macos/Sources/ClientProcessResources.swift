import Darwin
import Foundation
import TodoAPI

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

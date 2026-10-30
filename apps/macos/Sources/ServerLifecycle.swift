import Foundation
import Darwin

struct ServerIdentity: Codable, Equatable, Sendable {
    let build: String
    let contract: String

    init?(version: String) {
        let fields = version.split(whereSeparator: \.isWhitespace)
        guard let build = fields.first(where: { $0.hasPrefix("build=") }),
              let contract = fields.first(where: { $0.hasPrefix("contract=") }) else { return nil }
        self.build = String(build.dropFirst(6))
        self.contract = String(contract.dropFirst(9))
    }
    static var appBuild: String {
        guard let path = Bundle.main.url(forResource: "identity", withExtension: "txt", subdirectory: "Server"),
              let version = try? String(contentsOf: path, encoding: .utf8) else { return "dev" }
        return Self(version: version)?.build ?? "dev"
    }
}

struct ManagedServerConfiguration: Codable, Equatable, Sendable {
    let executable: String
    let database: String
    let port: Int

    var endpoint: URL? {
        port == 0 ? nil : URL(string: "http://127.0.0.1:\(port)")
    }
}

struct ManagedServerStatus: Codable, Sendable {
    let label: String
    let path: String
    let installed: Bool
    let loaded: Bool
    let configuration: ManagedServerConfiguration?
    var installedIdentity: ServerIdentity? = nil
    var bundledIdentity: ServerIdentity? = nil
    var needsUpdate: Bool { installed && (installedIdentity == nil || installedIdentity != bundledIdentity) }
}

struct ServerLifecycle: Sendable {
    let bundledServer: URL
    let home: URL
    let label: String

    static func production(bundle: Bundle = .main) -> Self {
        Self(bundledServer: bundle.bundleURL.appendingPathComponent("Contents/Resources/Server/todo-server"),
             home: FileManager.default.homeDirectoryForCurrentUser, label: "com.todo-cli.server")
    }

    func status() async throws -> ManagedServerStatus {
        var result = try await command("status", executable: bundledServer)
        result.bundledIdentity = try? await identity(executable: bundledServer)
        if let configuration = result.configuration {
            result.installedIdentity = try? await identity(executable: URL(fileURLWithPath: configuration.executable))
        }
        return result
    }

    func install(database: String, port: Int) async throws -> ManagedServerStatus {
        let current = try await status()
        guard !current.installed, !current.loaded else {
            throw Failure("A managed server already exists. Refresh status and use Repair / restart to preserve its configuration.")
        }
        guard database.hasPrefix("/"), !database.contains("\0"), (1...65535).contains(port) else {
            throw Failure("Choose an absolute database path and a port from 1 to 65535.")
        }
        try await requireAvailable(port: port)
        let directory = home.appendingPathComponent("Library/Application Support/Todo/Server")
        let destination = directory.appendingPathComponent("todo-server")
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try replaceExecutable(at: destination)
        return try await command("install", executable: destination,
                                 configuration: ManagedServerConfiguration(executable: destination.path, database: database, port: port))
    }

    private func replaceExecutable(at destination: URL) throws {
        if (try? destination.resourceValues(forKeys: [.isSymbolicLinkKey]).isSymbolicLink) == true {
            throw Failure("Refusing to replace a server executable through a symbolic link.")
        }
        let temporary = destination.deletingLastPathComponent().appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: temporary) }
        try FileManager.default.copyItem(at: bundledServer, to: temporary)
        if FileManager.default.fileExists(atPath: destination.path) {
            _ = try FileManager.default.replaceItemAt(destination, withItemAt: temporary)
        } else {
            try FileManager.default.moveItem(at: temporary, to: destination)
        }
    }

    func repair() async throws -> ManagedServerStatus {
        let current = try await status()
        guard current.installed, let configuration = current.configuration else {
            throw Failure("No managed configuration to repair. Choose Install after entering a database path.")
        }
        if !current.loaded { try await requireAvailable(port: configuration.port) }
        if current.needsUpdate { try replaceExecutable(at: URL(fileURLWithPath: configuration.executable)) }
        return try await command("install", executable: URL(fileURLWithPath: configuration.executable), configuration: configuration)
    }

    func update() async throws -> ManagedServerStatus { try await repair() }

    private func identity(executable: URL) async throws -> ServerIdentity {
        try await Task.detached {
            guard executable.resolvingSymlinksInPath().standardizedFileURL == executable.standardizedFileURL else {
                throw Failure("Refusing to read a server build through a symbolic link.")
            }
            let process = Process()
            process.executableURL = executable
            process.arguments = ["--version"]
            var environment = ProcessInfo.processInfo.environment.filter { !$0.key.hasPrefix("TODO_") }
            environment["HOME"] = home.path
            process.environment = environment
            let output = Pipe()
            process.standardOutput = output
            process.standardError = output
            try process.run()
            let data = output.fileHandleForReading.readDataToEndOfFile()
            process.waitUntilExit()
            guard process.terminationStatus == 0, let identity = ServerIdentity(version: String(decoding: data, as: UTF8.self)) else {
                throw Failure("Server build is unknown.")
            }
            return identity
        }.value
    }

    private func requireAvailable(port: Int) async throws {
        if port == 0 { return }
        guard (1...65535).contains(port) else { throw Failure("Invalid managed server port.") }
        try await Task.detached {
            let socket = Darwin.socket(AF_INET, SOCK_STREAM, 0)
            guard socket >= 0 else { throw Failure("Cannot check the server address.") }
            defer { Darwin.close(socket) }
            let flags = fcntl(socket, F_GETFL)
            guard flags >= 0, fcntl(socket, F_SETFL, flags | O_NONBLOCK) == 0 else {
                throw Failure("Cannot check the server address.")
            }
            var address = sockaddr_in()
            address.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
            address.sin_family = sa_family_t(AF_INET)
            address.sin_port = UInt16(port).bigEndian
            address.sin_addr = in_addr(s_addr: inet_addr("127.0.0.1"))
            let result = withUnsafePointer(to: &address) {
                $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                    Darwin.connect(socket, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
                }
            }
            if result < 0 {
                if errno == ECONNREFUSED { return }
                guard errno == EINPROGRESS else { throw Failure("Cannot check the server address.") }
                var descriptor = pollfd(fd: socket, events: Int16(POLLOUT), revents: 0)
                guard poll(&descriptor, 1, 250) > 0 else { throw Failure("Cannot check the server address in time.") }
                var error: Int32 = 0
                var size = socklen_t(MemoryLayout<Int32>.size)
                guard getsockopt(socket, SOL_SOCKET, SO_ERROR, &error, &size) == 0 else {
                    throw Failure("Cannot check the server address.")
                }
                if error == ECONNREFUSED { return }
                guard error == 0 else { throw Failure("Cannot check the server address.") }
            }
            throw Failure("The server address is occupied. Stop its listener before installing or repairing the server.")
        }.value
        try Task.checkCancellation()
    }

    func uninstall() async throws -> ManagedServerStatus {
        try await command("uninstall", executable: bundledServer)
    }

    private func command(_ action: String, executable: URL, configuration: ManagedServerConfiguration? = nil) async throws -> ManagedServerStatus {
        try await Task.detached {
            guard FileManager.default.isExecutableFile(atPath: executable.path) else {
                throw Failure("Server executable is missing or not executable: \(executable.path)")
            }
            let process = Process()
            process.executableURL = executable
            process.arguments = [action]
            var environment = ProcessInfo.processInfo.environment
            for key in environment.keys where key.hasPrefix("TODO_") { environment.removeValue(forKey: key) }
            environment["HOME"] = home.path
            environment["TODO_SERVICE_LABEL"] = label
            if let configuration {
                environment["TODO_DB"] = configuration.database
                environment["TODO_PORT"] = String(configuration.port)
            }
            process.environment = environment
            let output = Pipe()
            process.standardOutput = output
            process.standardError = output
            try process.run()
            let data = output.fileHandleForReading.readDataToEndOfFile()
            process.waitUntilExit()
            guard process.terminationStatus == 0 else {
                throw Failure("Server \(action) failed (\(process.terminationStatus)): \(String(decoding: data, as: UTF8.self))")
            }
            let status = try JSONDecoder().decode(ManagedServerStatus.self, from: data)
            guard status.label == label,
                  status.path == home.appendingPathComponent("Library/LaunchAgents/\(label).plist").path,
                  action != "status" || status.installed == (status.configuration != nil) else {
                throw Failure("Server returned an unexpected managed installation.")
            }
            if action != "status" { return try await self.status() }
            return status
        }.value
    }

    struct Failure: LocalizedError {
        let errorDescription: String?
        init(_ message: String) { errorDescription = message }
    }
}

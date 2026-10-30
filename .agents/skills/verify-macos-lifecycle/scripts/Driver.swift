import Foundation
import Darwin

@main
struct LifecycleDriver {
    static func main() async {
        do { try await drive() }
        catch {
            FileHandle.standardError.write(Data((error.localizedDescription + "\n").utf8))
            exit(1)
        }
    }

    static func drive() async throws {
        let args = CommandLine.arguments
        guard args.count >= 5 else { throw ServerLifecycle.Failure("bundle home label action [database port]") }
        let scope = try VerificationScope(home: args[2], label: args[3])
        let home = scope.home
        let bundle = try scope.owned(args[1])
        let lifecycle = ServerLifecycle(bundledServer: bundle, home: home, label: args[3])
        let result: ManagedServerStatus
        switch args[4] {
        case "status": result = try await lifecycle.status()
        case "install":
            guard args.count == 7, let port = Int(args[6]) else { throw ServerLifecycle.Failure("database and port required") }
            let database = try scope.owned(args[5])
            result = try await lifecycle.install(database: database.path, port: port)
        case "repair", "update":
            let current = try await lifecycle.status()
            if let configuration = current.configuration {
                _ = try scope.owned(configuration.database)
                _ = try scope.owned(configuration.executable)
            }
            result = args[4] == "update" ? try await lifecycle.update() : try await lifecycle.repair()
        case "uninstall": result = try await lifecycle.uninstall()
        default: throw ServerLifecycle.Failure("Unknown lifecycle action")
        }
        print(String(decoding: try JSONEncoder().encode(result), as: UTF8.self))
    }
}

struct VerificationScope {
    let home: URL
    let root: String

    init(home path: String, label: String) throws {
        let resolved = try Self.resolve(path)
        let root = (resolved as NSString).deletingLastPathComponent
        let temporary = try Self.resolve(NSTemporaryDirectory())
        var isDirectory: ObjCBool = false
        guard FileManager.default.fileExists(atPath: resolved, isDirectory: &isDirectory), isDirectory.boolValue,
              path == resolved,
              (resolved as NSString).lastPathComponent == "home",
              (root as NSString).lastPathComponent.hasPrefix("todo-w02-verify-"),
              (root as NSString).deletingLastPathComponent == temporary,
              label.range(of: "^com[.]todo-cli[.]server[.]verify-[0-9]+-[0-9a-f]{12}$", options: .regularExpression) != nil else {
            throw ServerLifecycle.Failure("Headless proof requires a resolved run-owned scratch HOME and unique verify label")
        }
        self.home = URL(fileURLWithPath: resolved)
        self.root = root
    }

    func owned(_ path: String) throws -> URL {
        let resolved = try Self.resolve(path)
        guard path == resolved, resolved.hasPrefix(root + "/") else {
            throw ServerLifecycle.Failure("Verification path must stay inside resolved run-owned scratch: \(path)")
        }
        return URL(fileURLWithPath: resolved)
    }

    private static func resolve(_ path: String) throws -> String {
        guard path.hasPrefix("/"), !path.contains("\0") else {
            throw ServerLifecycle.Failure("Verification path must be absolute")
        }
        var existing = path
        var suffix: [String] = []
        while true {
            var attributes = stat()
            if lstat(existing, &attributes) == 0, (attributes.st_mode & S_IFMT) == S_IFLNK {
                throw ServerLifecycle.Failure("Symlinks are not allowed in verification paths: \(path)")
            }
            if let pointer = realpath(existing, nil) {
                defer { free(pointer) }
                return suffix.reversed().reduce(String(cString: pointer)) { $0 + "/" + $1 }
            }
            guard errno == ENOENT, existing != "/" else {
                throw ServerLifecycle.Failure("Cannot resolve verification path: \(path)")
            }
            let component = (existing as NSString).lastPathComponent
            guard component != ".", component != "..", !component.isEmpty else {
                throw ServerLifecycle.Failure("Invalid verification path: \(path)")
            }
            suffix.append(component)
            existing = (existing as NSString).deletingLastPathComponent
        }
    }
}

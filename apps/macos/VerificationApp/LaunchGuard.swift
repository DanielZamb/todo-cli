import CryptoKit
import Darwin
import Foundation

struct VerificationManifest: Decodable {
    let root: String
    let home: String
    let serverURL: String
    let serverPath: String
    let cliPath: String
    let serverSHA256: String
    let cliSHA256: String
    let serverPID: Int32
    let database: String
    let contract: String
    let build: String
    let profile: String
    let session: String
}

struct VerificationRefusal: LocalizedError {
    let message: String
    var errorDescription: String? { "Todo Verification refused: " + message }
}

@MainActor enum LaunchGuard {
    static var accepted: VerificationManifest?

    static func require(_ condition: Bool, _ message: String) throws {
        guard condition else { throw VerificationRefusal(message: message) }
    }

    static func check(expectedContract: String? = nil) throws {
        let environment = ProcessInfo.processInfo.environment
        guard let path = environment["TODO_VERIFICATION_MANIFEST"] else {
            throw VerificationRefusal(message: "A private launch manifest is required.")
        }
        let file = URL(fileURLWithPath: path, isDirectory: false)
        func canonical(_ path: String) -> String? {
            guard let pointer = realpath(path, nil) else { return nil }
            defer { free(pointer) }
            return String(cString: pointer)
        }
        let candidateRoot = file.deletingLastPathComponent()
        try require(candidateRoot.deletingLastPathComponent().path == canonical("/tmp") && candidateRoot.lastPathComponent.hasPrefix("todo-mac-verify-"), "The manifest must be directly inside a scratch run.")
        for url in [candidateRoot, file] {
            var info = stat()
            try require(lstat(url.path, &info) == 0 && info.st_mode & S_IFMT != S_IFLNK, "The manifest must not use a symbolic link.")
            try require(info.st_uid == getuid() && info.st_mode & 0o077 == 0, "The run root and manifest must be private and owned by this user.")
        }
        try require(path == canonical(path), "The manifest must not use a symbolic link.")
        let manifest = try JSONDecoder().decode(VerificationManifest.self, from: Data(contentsOf: file))
        try require(expectedContract == nil || manifest.contract == expectedContract, "The manifest contract does not match this client.")
        let root = URL(fileURLWithPath: manifest.root)
        try require(root.path == candidateRoot.path && manifest.root == canonical(manifest.root), "The run root must be a fresh todo-mac-verify- temporary directory.")
        func ownedPath(_ path: String) throws -> URL {
            let url = URL(fileURLWithPath: path)
            try require(path == url.path && path.hasPrefix(manifest.root + "/") && canonical(path) == path, "Every launch path must stay inside the scratch run without symbolic links.")
            return url
        }
        _ = try ownedPath(path)
        let home = try ownedPath(manifest.home)
        try require(home.path == root.appendingPathComponent("home").path && environment["HOME"] == home.path && environment["CFFIXED_USER_HOME"] == home.path && canonical(FileManager.default.homeDirectoryForCurrentUser.path) == home.path, "HOME and CFFIXED_USER_HOME must name this run's scratch home.")
        _ = try ownedPath(manifest.database)
        let server = try ownedPath(manifest.serverPath)
        let cli = try ownedPath(manifest.cliPath)
        guard let destination = URLComponents(string: manifest.serverURL), destination.scheme == "http", destination.host == "127.0.0.1", let port = destination.port, (1...65535).contains(port), destination.user == nil, destination.password == nil, destination.query == nil, destination.fragment == nil, destination.path.isEmpty else {
            throw VerificationRefusal(message: "The server must be an explicit http://127.0.0.1 loopback port.")
        }
        func digest(_ url: URL) throws -> String {
            SHA256.hash(data: try Data(contentsOf: url, options: .mappedIfSafe)).map { String(format: "%02x", $0) }.joined()
        }
        try require(try digest(server) == manifest.serverSHA256 && digest(cli) == manifest.cliSHA256, "The compiled server or CLI hash does not match the manifest.")
        try require(manifest.serverPID > 1, "An owned scratch server PID is required.")
        var executable = [CChar](repeating: 0, count: 4 * Int(MAXPATHLEN))
        let length = proc_pidpath(manifest.serverPID, &executable, UInt32(executable.count))
        try require(length > 0 && String(cString: executable) == server.path, "The listener must be the compiled scratch server process.")
        let listener = try command("/usr/sbin/lsof", ["-nP", "-a", "-iTCP:\(port)", "-sTCP:LISTEN", "-Fpn"])
        let lines = listener.split(separator: "\n").map(String.init)
        try require(lines.filter { $0.hasPrefix("p") } == ["p\(manifest.serverPID)"] && lines.filter { $0.hasPrefix("n") } == ["n127.0.0.1:\(port)"], "The loopback port must belong only to the scratch server PID.")
        let process = try command("/bin/ps", ["eww", "-p", String(manifest.serverPID), "-o", "command="])
        try require(process.contains("HOME=\(home.path) ") && process.contains("TODO_DB=\(manifest.database) "), "The server must use the manifest's scratch HOME and database.")
        let response = try command("/usr/bin/curl", ["--silent", "--show-error", "--fail", "--max-time", "5", "--noproxy", "*", manifest.serverURL + "/health"])
        let health = try JSONDecoder().decode([String: String].self, from: Data(response.utf8))
        try require(health == ["service": "todo-server", "contract": manifest.contract, "build": manifest.build], "The scratch server identity does not match the manifest.")
        try require(manifest.session.hasPrefix("ses_") && !manifest.profile.isEmpty, "A scratch owner Session and Profile are required.")
        accepted = manifest
    }

    private static func command(_ executable: String, _ arguments: [String]) throws -> String {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: executable)
        process.arguments = arguments
        let output = Pipe()
        process.standardOutput = output
        process.standardError = FileHandle.nullDevice
        try process.run()
        let data = output.fileHandleForReading.readDataToEndOfFile()
        process.waitUntilExit()
        try require(process.terminationStatus == 0, "Scratch server ownership or health could not be verified.")
        return String(decoding: data, as: UTF8.self)
    }
}

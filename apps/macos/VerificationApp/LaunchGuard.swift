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
    let ownerHome: String
    let boundaryPath: String
    let boundarySHA256: String
    let outsideSentinel: String
    let probePort: Int
    let preflightPath: String
    let preflightLibraryPath: String
    let preflightSHA256: String
}

struct VerificationRefusal: LocalizedError {
    let message: String
    var errorDescription: String? { "Todo Verification refused: " + message }
}

@_silgen_name("verification_temporary_bind")
func bindTemporaryDirectory(_ fd: Int32)
@_silgen_name("verification_boundary_check")
func verificationBoundaryCheck(_ root: UnsafePointer<CChar>, _ owner: UnsafePointer<CChar>, _ outside: UnsafePointer<CChar>, _ port: Int32, _ otherPort: Int32, _ role: UnsafePointer<CChar>) -> Int32

@_silgen_name("verification_seal_register")
private func sealRegister(_ fd: Int32, _ flags: UInt32) -> Int32

func verificationRequire(_ condition: Bool, _ message: String) throws {
    guard condition else { throw VerificationRefusal(message: message) }
}

func verificationCanonical(_ path: String) -> String? {
    guard let resolved = realpath(path, nil) else { return nil }
    defer { free(resolved) }
    return String(cString: resolved)
}

final class ScratchDescriptor {
    let fd: Int32
    let path: String
    private(set) var initial: stat
    let directory: Bool
    let privateMode: Bool
    let immutableContents: Bool
    private var sealed = false
    private var protection: UInt32 = 0

    init(fd: Int32, path: String, device: dev_t?, directory: Bool, privateMode: Bool = false, immutableContents: Bool = false) throws {
        self.fd = fd; self.path = path; self.directory = directory; self.privateMode = privateMode; self.immutableContents = immutableContents
        var info = stat()
        do {
            try verificationRequire(fd >= 0 && fstat(fd, &info) == 0, "A scratch descriptor could not be inspected.")
            try verificationRequire(info.st_mode & S_IFMT == (directory ? S_IFDIR : S_IFREG), "Every accepted object must have its expected regular-file or directory type.")
            try verificationRequire(directory || info.st_nlink == 1, "Every accepted regular file must have exactly one link.")
            try verificationRequire(info.st_uid == getuid() && (device == nil || info.st_dev == device), "Every accepted object must be owned and on the scratch root device.")
            try verificationRequire(!privateMode || info.st_mode & 0o077 == 0, "The run root, HOME and manifest must be private.")
            var actual = [CChar](repeating: 0, count: Int(MAXPATHLEN))
            try verificationRequire(fcntl(fd, F_GETPATH, &actual) == 0 && String(cString: actual) == path, "The opened descriptor must resolve to its exact scratch path.")
        } catch { if fd >= 0 { close(fd) }; throw error }
        initial = info
    }
    deinit { unseal(); close(fd) }
    func seal() throws {
        guard immutableContents else { return }
        try verificationRequire(sealRegister(fd, initial.st_flags) == 0, "The scratch input seal could not register cleanup.")
        try verificationRequire(fchflags(fd, initial.st_flags | UInt32(UF_IMMUTABLE)) == 0, "The immutable scratch input could not be sealed before use.")
        protection = UInt32(UF_IMMUTABLE); sealed = true
    }
    func recordOwnedWrite() throws {
        var info = stat()
        try verificationRequire(fstat(fd, &info) == 0 && info.st_dev == initial.st_dev && info.st_ino == initial.st_ino && info.st_nlink == 1, "The run claim changed while recording its marker.")
        initial = info
    }
    func protectEntries() throws {
        try verificationRequire(sealRegister(fd, initial.st_flags) == 0, "The directory protection could not register cleanup.")
        try verificationRequire(directory && fchflags(fd, initial.st_flags | UInt32(UF_APPEND)) == 0, "The accepted scratch directory could not protect its existing entries.")
        protection = UInt32(UF_APPEND); sealed = true
    }
    func unseal() { if sealed { _ = fchflags(fd, initial.st_flags); sealed = false } }
    func requireUsage(directory: Bool, privateMode: Bool, immutable: Bool) throws {
        try verify()
        try verificationRequire(self.directory == directory && (!privateMode || self.privateMode) && (!immutable || immutableContents), "A cached scratch descriptor must retain every requested type and protection.")
    }
    func verify() throws {
        var now = stat(), named = stat()
        try verificationRequire(fstat(fd, &now) == 0 && lstat(path, &named) == 0, "An accepted scratch object disappeared.")
        try verificationRequire(now.st_dev == initial.st_dev && now.st_ino == initial.st_ino && named.st_dev == now.st_dev && named.st_ino == now.st_ino && named.st_mode & S_IFMT == (directory ? S_IFDIR : S_IFREG), "An accepted scratch object was replaced.")
        try verificationRequire(now.st_uid == getuid() && (directory || now.st_nlink == 1), "An accepted scratch object changed ownership or acquired a hard link.")
        try verificationRequire(!privateMode || now.st_mode & 0o077 == 0, "An accepted private scratch object became accessible to another user.")
        var actual = [CChar](repeating: 0, count: Int(MAXPATHLEN))
        try verificationRequire(fcntl(fd, F_GETPATH, &actual) == 0 && String(cString: actual) == path, "An accepted scratch directory or file was renamed.")
        try verificationRequire(!sealed || now.st_flags & protection == protection, "An accepted scratch protection was removed.")
        if immutableContents {
            try verificationRequire(now.st_size == initial.st_size && now.st_mtimespec.tv_sec == initial.st_mtimespec.tv_sec && now.st_mtimespec.tv_nsec == initial.st_mtimespec.tv_nsec, "An immutable scratch input changed after opening.")
        }
    }
    func data(limit: Int = 1_048_576) throws -> Data {
        try verificationRequire(initial.st_size >= 0 && initial.st_size <= limit, "A scratch input is too large.")
        var data = Data(count: Int(initial.st_size))
        let count = data.withUnsafeMutableBytes { pread(fd, $0.baseAddress, $0.count, 0) }
        try verificationRequire(count == data.count, "A scratch input could not be read through its descriptor.")
        try verify()
        return data
    }
    func digest() throws -> String {
        var digest = SHA256(), offset: off_t = 0
        var bytes = [UInt8](repeating: 0, count: 1_048_576)
        while true {
            let count = pread(fd, &bytes, bytes.count, offset)
            try verificationRequire(count >= 0, "A compiled scratch input could not be hashed.")
            if count == 0 { break }
            digest.update(data: Data(bytes.prefix(count))); offset += off_t(count)
        }
        try verify()
        return digest.finalize().map { String(format: "%02x", $0) }.joined()
    }
}

final class ScratchFiles {
    let root: ScratchDescriptor
    private(set) var objects: [String: ScratchDescriptor] = [:]
    init(_ path: String) throws {
        let parts = path.split(separator: "/").map(String.init)
        try verificationRequire(parts.count == 3 && parts[0] == "private" && parts[1] == "tmp" && parts[2].hasPrefix("todo-mac-verify-") && path == "/" + parts.joined(separator: "/"), "The manifest must be directly inside a canonical scratch run.")
        var parent = Darwin.open("/", O_RDONLY | O_DIRECTORY | O_CLOEXEC)
        for part in parts {
            let next = openat(parent, part, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC)
            close(parent); parent = next
            try verificationRequire(parent >= 0, "No scratch path component may be a symbolic link.")
        }
        root = try ScratchDescriptor(fd: parent, path: path, device: nil, directory: true, privateMode: true)
        objects[path] = root
    }
    func open(_ path: String, directory: Bool = false, privateMode: Bool = false, immutable: Bool = false, create: Bool = false, writable: Bool = false) throws -> ScratchDescriptor {
        if let existing = objects[path] { try existing.requireUsage(directory: directory, privateMode: privateMode, immutable: immutable); return existing }
        try verificationRequire(path.hasPrefix(root.path + "/"), "Every accepted path must stay inside the scratch root.")
        let suffix = String(path.dropFirst(root.path.count + 1))
        let parts = suffix.split(separator: "/", omittingEmptySubsequences: false).map(String.init)
        try verificationRequire(parts.allSatisfy { !$0.isEmpty && $0 != "." && $0 != ".." }, "Scratch paths must contain no empty, dot or parent components.")
        var parent = root
        for (index, part) in parts.enumerated() {
            let final = index == parts.count - 1
            let isDirectory = !final || directory
            let current = parent.path + "/" + part
            if let existing = objects[current] { try existing.requireUsage(directory: isDirectory, privateMode: final && privateMode, immutable: final && immutable); parent = existing; continue }
            if isDirectory && create { _ = mkdirat(parent.fd, part, 0o700) }
            let flags = (writable ? O_RDWR : O_RDONLY) | O_NOFOLLOW | O_CLOEXEC | O_NONBLOCK | (isDirectory ? O_DIRECTORY : 0)
            var fd = openat(parent.fd, part, flags)
            if fd < 0 && errno == ENOENT && create && !isDirectory {
                fd = openat(parent.fd, part, flags | O_CREAT | O_EXCL, 0o600)
            }
            let object = try ScratchDescriptor(fd: fd, path: current, device: root.initial.st_dev, directory: isDirectory, privateMode: final && privateMode, immutableContents: final && immutable)
            objects[current] = object; parent = object
        }
        return parent
    }
    func verify() throws { for object in objects.values { try object.verify() } }
    func audit(_ directory: ScratchDescriptor? = nil) throws {
        let directory = directory ?? root
        guard let stream = fdopendir(dup(directory.fd)) else { throw VerificationRefusal(message: "The scratch directory could not be enumerated by descriptor.") }
        defer { closedir(stream) }
        while let entry = readdir(stream) {
            let name = withUnsafePointer(to: &entry.pointee.d_name) { $0.withMemoryRebound(to: CChar.self, capacity: Int(MAXNAMLEN) + 1) { String(cString: $0) } }
            if name == "." || name == ".." { continue }
            var info = stat()
            try verificationRequire(fstatat(directory.fd, name, &info, AT_SYMLINK_NOFOLLOW) == 0, "A scratch directory entry changed during inspection.")
            let isDirectory = info.st_mode & S_IFMT == S_IFDIR
            let object = try ScratchDescriptor(fd: openat(directory.fd, name, O_RDONLY | O_NOFOLLOW | O_NONBLOCK | O_CLOEXEC | (isDirectory ? O_DIRECTORY : 0)), path: directory.path + "/" + name, device: root.initial.st_dev, directory: isDirectory)
            if isDirectory { try audit(object) }
        }
        try directory.verify()
    }
    func protectDirectories() throws { for object in objects.values where object.directory { try object.protectEntries() } }
    func releaseSeals() { for object in objects.values { object.unseal() } }
}

final class VerificationClaim {
    let storage: ScratchFiles
    let file: ScratchDescriptor
    init(storage: ScratchFiles, consumed: Bool) throws {
        self.storage = storage
        file = try storage.open(storage.root.path + "/.instance-lock", privateMode: true, immutable: true, create: true, writable: consumed)
        try verificationRequire(flock(file.fd, LOCK_EX | LOCK_NB) == 0, "Another verification instance already holds this lock.")
        try file.verify()
        if consumed {
            try verificationRequire(file.initial.st_size == 0, "This scratch run has already been claimed.")
            let marker = Data("claimed\n".utf8)
            try verificationRequire(marker.withUnsafeBytes { pwrite(file.fd, $0.baseAddress, $0.count, 0) } == marker.count && fsync(file.fd) == 0, "The scratch run claim could not be recorded.")
            try file.recordOwnedWrite()
        }
        try file.seal()
    }
    static func machine() throws -> VerificationClaim {
        let path = "/private/tmp/todo-mac-verify-machine-lock"
        _ = mkdir(path, 0o700)
        let storage = try ScratchFiles(path)
        let claim = try VerificationClaim(storage: storage, consumed: false)
        try storage.protectDirectories()
        try storage.verify()
        return claim
    }
}

class VerificationHTTP: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    static func configuration() -> URLSessionConfiguration {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpCookieStorage = nil
        configuration.httpShouldSetCookies = false
        configuration.urlCredentialStorage = nil
        configuration.urlCache = nil
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.connectionProxyDictionary = ["HTTPEnable": 0, "HTTPSEnable": 0, "SOCKSEnable": 0, "ProxyAutoConfigEnable": 0, "ProxyAutoDiscoveryEnable": 0]
        configuration.timeoutIntervalForRequest = 5
        configuration.timeoutIntervalForResource = 5
        return configuration
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping @Sendable (URLRequest?) -> Void) { completionHandler(nil) }
    func urlSession(_ session: URLSession, task: URLSessionTask, didReceive challenge: URLAuthenticationChallenge, completionHandler: @escaping @Sendable (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) { completionHandler(.cancelAuthenticationChallenge, nil) }
    private final class Result: @unchecked Sendable { var value: (Data?, URLResponse?, (any Error)?)? }
    static func get(_ url: URL, headers: [String: String] = [:]) throws -> Data {
        try verificationRequire(url.scheme == "http" && url.host == "127.0.0.1" && url.port != nil && url.user == nil && url.password == nil, "HTTP requests must use an explicit literal loopback address and port.")
        let delegate = VerificationHTTP()
        let session = URLSession(configuration: configuration(), delegate: delegate, delegateQueue: nil)
        defer { session.invalidateAndCancel() }
        let result = Result(), ready = DispatchSemaphore(value: 0)
        var request = URLRequest(url: url); request.httpMethod = "GET"
        request.allHTTPHeaderFields = headers
        let task = session.dataTask(with: request) { data, response, error in result.value = (data, response, error); ready.signal() }
        task.resume()
        try verificationRequire(ready.wait(timeout: .now() + 6) == .success, "The owned scratch health request timed out.")
        guard let (data, response, error) = result.value else { throw VerificationRefusal(message: "The owned scratch health response is missing.") }
        try verificationRequire(error == nil && (response as? HTTPURLResponse)?.statusCode == 200 && response?.url == url, "The scratch health request failed or attempted a redirect.")
        try verificationRequire((data?.count ?? Int.max) <= 65_536, "The scratch health response is too large.")
        return data!
    }
    static func health(_ url: URL) throws -> [String: String] {
        try JSONDecoder().decode([String: String].self, from: get(url))
    }
}

@_silgen_name("verification_child_inspect")
private func childInspect(_ pid: Int32, _ device: UInt64, _ inode: UInt64, _ port: UInt16) -> Int32
@_silgen_name("verification_child_register")
private func childRegister(_ pid: Int32)
@_silgen_name("verification_child_cleanup")
func verificationChildCleanup()

@MainActor enum LaunchGuard {
    static var accepted: VerificationManifest?
    static var files: ScratchFiles?
    static var child: Process?
    static var database: ScratchDescriptor?
    static var runClaim: VerificationClaim?
    static var machineClaim: VerificationClaim?
    static var serverLog: ScratchDescriptor?
    static func require(_ condition: Bool, _ message: String) throws { try verificationRequire(condition, message) }

    static func check(expectedContract: String? = nil, visible: Bool = false, expectedServerSHA256: String? = nil, expectedCLISHA256: String? = nil, expectedBoundarySHA256: String? = nil, expectedPreflightSHA256: String? = nil, beforeSandbox: (@MainActor (Data) throws -> Void)? = nil) throws {
        let environment = ProcessInfo.processInfo.environment
        guard let path = environment["TODO_VERIFICATION_MANIFEST"] else { throw VerificationRefusal(message: "A private launch manifest is required.") }
        guard let slash = path.lastIndex(of: "/") else { throw VerificationRefusal(message: "A canonical manifest path is required.") }
        let rootPath = String(path.prefix(through: slash)).dropLast()
        let storage = try ScratchFiles(String(rootPath)); files = storage
        do {
            try require(path == storage.root.path + "/manifest.json", "The owned server and app must read the same fixed manifest path.")
            runClaim = try VerificationClaim(storage: storage, consumed: true)
            if visible { machineClaim = try VerificationClaim.machine() }
            let input = try storage.open(path, privateMode: true, immutable: true)
            try input.seal()
            let manifest = try JSONDecoder().decode(VerificationManifest.self, from: input.data())
            guard let owner = getpwuid(getuid()), let ownerPath = owner.pointee.pw_dir else { throw VerificationRefusal(message: "The real home path could not be isolated.") }
            try require(manifest.ownerHome == String(cString: ownerPath), "Boundary probes must use the actual owner home metadata.")
            try require((1...65535).contains(manifest.probePort) && manifest.outsideSentinel.hasPrefix("/private/tmp/todo-mac-verify-") && !manifest.outsideSentinel.contains(".."), "Boundary controls require an owned scratch sentinel and port.")
            try require(manifest.root == storage.root.path, "The manifest must name its own scratch root.")
            try require(expectedContract == nil || manifest.contract == expectedContract, "The manifest contract does not match this client.")
            let home = try storage.open(manifest.home, directory: true, privateMode: true)
            try require(home.path == storage.root.path + "/home" && environment["HOME"] == home.path && environment["CFFIXED_USER_HOME"] == home.path && verificationCanonical(FileManager.default.homeDirectoryForCurrentUser.path) == home.path, "HOME and CFFIXED_USER_HOME must name this run's scratch home.")
            let temporary = try storage.open(manifest.root + "/tmp", directory: true, privateMode: true)
            bindTemporaryDirectory(temporary.fd)
            FileHandle.standardError.write(Data("directory-configuration ".utf8) + (try JSONSerialization.data(withJSONObject: ["home": FileManager.default.homeDirectoryForCurrentUser.path, "temporary": NSTemporaryDirectory(), "expectedTemporary": temporary.path], options: .sortedKeys)) + Data("\n".utf8))
            try require(environment["TMPDIR"] == temporary.path && verificationCanonical(NSTemporaryDirectory()) == temporary.path, "TMPDIR must name the checked scratch temporary directory.")
            _ = try storage.open(manifest.home + "/journal", directory: true, privateMode: true, create: true)
            database = try storage.open(manifest.database)
            _ = try storage.open(manifest.database + "-wal", create: true)
            _ = try storage.open(manifest.database + "-shm", create: true)
            let server = try storage.open(manifest.serverPath, immutable: true), cli = try storage.open(manifest.cliPath, immutable: true)
            try server.seal(); try cli.seal()
            try require(manifest.boundaryPath == manifest.root + "/boundary.dylib", "The server boundary library must use its fixed scratch path.")
            let boundary = try storage.open(manifest.boundaryPath, immutable: true)
            try boundary.seal()
            let boundaryHash = try boundary.digest()
            try require(manifest.boundarySHA256 == expectedBoundarySHA256 && boundaryHash == manifest.boundarySHA256, "The server boundary library must match the frozen build through its opened descriptor.")
            try require(manifest.preflightPath == manifest.root + "/owner-preflight" && manifest.preflightLibraryPath == manifest.root + "/libCredentialTrap.dylib", "The metadata child and its library must use their fixed scratch paths.")
            let preflight = try storage.open(manifest.preflightPath, immutable: true)
            let preflightLibrary = try storage.open(manifest.preflightLibraryPath, immutable: true)
            try preflight.seal(); try preflightLibrary.seal()
            try require(try preflight.digest() == manifest.preflightSHA256 && manifest.preflightSHA256 == expectedPreflightSHA256, "The metadata executable must match the frozen build through its opened descriptor.")
            try require(try preflightLibrary.digest() == manifest.boundarySHA256, "The metadata child's library must match the checked boundary library.")
            try require(manifest.serverSHA256 == expectedServerSHA256 && manifest.cliSHA256 == expectedCLISHA256, "The manifest binary hashes must match this qualification build, not values chosen by the manifest.")
            try require(try server.digest() == manifest.serverSHA256 && cli.digest() == manifest.cliSHA256, "The compiled server or CLI hash does not match the manifest.")
            guard let destination = URLComponents(string: manifest.serverURL), destination.scheme == "http", destination.host == "127.0.0.1", let port = destination.port, (1...65535).contains(port), destination.user == nil, destination.password == nil, destination.query == nil, destination.fragment == nil, destination.path.isEmpty else { throw VerificationRefusal(message: "The server must be an explicit http://127.0.0.1 loopback port.") }
            try require(manifest.probePort != port, "A negative network control must never target the chosen server port.")
            try require(manifest.serverPID == 0, "Attaching to an existing server is forbidden; the guard must start its own child.")
            try require(manifest.session.hasPrefix("ses_") && !manifest.profile.isEmpty, "A scratch owner Session and Profile are required.")
            let log = try storage.open(manifest.root + "/server.log", create: true, writable: true)
            serverLog = log
            try storage.audit(); try storage.verify(); try storage.protectDirectories()
            if visible {
                try require(beforeSandbox != nil, "A visible run requires the owned metadata-child validator.")
                let state = try ownedPreflight(manifest, executable: preflight, storage: storage)
                try beforeSandbox!(state)
            }
            try ScratchSandbox.install(root: manifest.root, executable: manifest.serverPath, serverURL: manifest.serverURL)
            let boundaryStatus = manifest.root.withCString { root in manifest.ownerHome.withCString { owner in manifest.outsideSentinel.withCString { outside in "app".withCString { role in verificationBoundaryCheck(root, owner, outside, Int32(port), Int32(manifest.probePort), role) } } } }
            try require(boundaryStatus == 0, "The app sandbox boundary checks failed.")
            let process = Process()
            process.executableURL = URL(fileURLWithPath: server.path)
            process.arguments = []
            process.currentDirectoryURL = URL(fileURLWithPath: storage.root.path)
            process.environment = ["HOME": home.path, "CFFIXED_USER_HOME": home.path, "TMPDIR": manifest.root + "/tmp", "TODO_DB": manifest.database, "TODO_PORT": String(port), "LANG": "C", "LC_ALL": "C"]
            process.standardInput = FileHandle.nullDevice
            let output = FileHandle(fileDescriptor: log.fd, closeOnDealloc: false)
            process.standardOutput = output
            process.standardError = output
            FileHandle.standardError.write(Data("owned-process ".utf8) + (try JSONSerialization.data(withJSONObject: ["executable": server.path, "arguments": [], "environment": process.environment!], options: .sortedKeys)) + Data("\n".utf8))
            try storage.verify(); try process.run(); child = process; childRegister(process.processIdentifier)
            var ready = false
            for _ in 0..<600 {
                try require(process.isRunning, "The owned scratch server stopped before readiness.")
                if childInspect(process.processIdentifier, UInt64(UInt32(bitPattern: database!.initial.st_dev)), database!.initial.st_ino, UInt16(port)) == 1 { ready = true; break }
                Thread.sleep(forTimeInterval: 0.01)
            }
            try require(ready, "The owned child must hold the accepted database inode and loopback listener.")
            try storage.verify()
            try verifyOwnedChild(port: UInt16(port))
            let health = try VerificationHTTP.health(URL(string: manifest.serverURL + "/health")!)
            try require(health == ["service": "todo-server", "contract": manifest.contract, "build": manifest.build], "The scratch server identity does not match the manifest.")
            try verifyOwnedChild(port: UInt16(port)); try storage.verify(); try storage.audit()
            accepted = manifest
        } catch {
            if let serverLog, (try? serverLog.recordOwnedWrite()) != nil, let data = try? serverLog.data(limit: 65_536) {
                FileHandle.standardError.write(Data("owned-server-log\n".utf8) + data)
            }
            stop()
            if let refusal = error as? VerificationRefusal { throw refusal }
            let failure = error as NSError
            throw VerificationRefusal(message: "The checked scratch operation failed (\(failure.domain), code \(failure.code)).")
        }
    }
    private static func ownedPreflight(_ manifest: VerificationManifest, executable: ScratchDescriptor, storage: ScratchFiles) throws -> Data {
        let process = Process(), pipe = Pipe()
        let log = try storage.open(manifest.root + "/preflight.log", create: true, writable: true)
        process.executableURL = URL(fileURLWithPath: executable.path)
        process.arguments = []
        process.currentDirectoryURL = URL(fileURLWithPath: manifest.root)
        process.environment = ["HOME": manifest.home, "CFFIXED_USER_HOME": manifest.home, "TMPDIR": manifest.root + "/tmp", "LANG": "C", "LC_ALL": "C"]
        process.standardInput = FileHandle.nullDevice
        process.standardOutput = pipe
        process.standardError = FileHandle(fileDescriptor: log.fd, closeOnDealloc: false)
        FileHandle.standardError.write(Data("owned-preflight-process ".utf8) + (try JSONSerialization.data(withJSONObject: ["executable": executable.path, "arguments": [], "environment": process.environment!], options: .sortedKeys)) + Data("\n".utf8))
        try storage.verify(); try process.run(); child = process; childRegister(process.processIdentifier)
        try pipe.fileHandleForWriting.close()
        defer { try? pipe.fileHandleForReading.close() }
        let fd = pipe.fileHandleForReading.fileDescriptor
        let flags = fcntl(fd, F_GETFL)
        try require(flags >= 0 && fcntl(fd, F_SETFL, flags | O_NONBLOCK) == 0, "The owned metadata pipe could not be bounded.")
        let started = ProcessInfo.processInfo.systemUptime
        var output = Data(), bytes = [UInt8](repeating: 0, count: 4096), ended = false
        while !ended || process.isRunning {
            try require(ProcessInfo.processInfo.systemUptime - started <= 5, "The owned metadata child timed out.")
            let count = ended ? 0 : read(fd, &bytes, bytes.count)
            try require(count >= 0 || errno == EAGAIN || errno == EINTR, "The owned metadata pipe could not be read.")
            if count > 0 {
                output.append(contentsOf: bytes.prefix(count))
            } else if count == 0 { ended = true }
            try require(output.count <= 65_536, "The owned metadata child output exceeded its limit.")
            if !ended || process.isRunning { Thread.sleep(forTimeInterval: 0.01) }
        }
        process.waitUntilExit()
        FileHandle.standardError.write(Data("owned-preflight-output\n".utf8) + output)
        try require(process.terminationReason == .exit && process.terminationStatus == 0, "The owned metadata child refused or failed.")
        try storage.verify(); try storage.audit()
        let records = String(decoding: output, as: UTF8.self).split(separator: "\n").filter { $0.hasPrefix("owner-preflight ") }
        try require(records.count == 1, "The owned metadata child must return exactly one snapshot.")
        child = nil
        return Data(records[0].dropFirst(16).utf8)
    }
    static func verifyOwnedChild(port: UInt16? = nil) throws {
        guard let child, let database else { throw VerificationRefusal(message: "No owned scratch server exists.") }
        let port = port ?? UInt16(URL(string: accepted!.serverURL)!.port!)
        try require(child.isRunning && childInspect(child.processIdentifier, UInt64(UInt32(bitPattern: database.initial.st_dev)), database.initial.st_ino, port) == 1, "The scratch server child, database descriptor or listener was replaced.")
    }
    static func stop() { verificationChildCleanup(); child?.waitUntilExit(); child = nil; files?.releaseSeals(); files = nil; database = nil; serverLog = nil; accepted = nil; runClaim = nil; machineClaim = nil }
}

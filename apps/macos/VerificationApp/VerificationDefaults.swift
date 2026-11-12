import Foundation
import ObjectiveC

private final class MemoryDefaults: UserDefaults, @unchecked Sendable {
    private let mutex = NSLock()
    private var values: [String: Any] = [:]
    override func object(forKey key: String) -> Any? { mutex.withLock { values[key] } }
    override func set(_ value: Any?, forKey key: String) {
        willChangeValue(forKey: key); mutex.withLock { values[key] = value }; didChangeValue(forKey: key)
        NotificationCenter.default.post(name: UserDefaults.didChangeNotification, object: self)
    }
    override func removeObject(forKey key: String) { set(nil, forKey: key) }
    override func dictionaryRepresentation() -> [String: Any] { mutex.withLock { values } }
    override func register(defaults: [String: Any]) { mutex.withLock { values.merge(defaults) { current, _ in current } } }
    override func addSuite(named suiteName: String) {}
    override func removeSuite(named suiteName: String) {}
    override func volatileDomain(forName name: String) -> [String: Any] { [:] }
    override func setVolatileDomain(_ domain: [String: Any], forName name: String) {}
    override func removeVolatileDomain(forName name: String) {}
    override func synchronize() -> Bool { true }
    override func persistentDomain(forName name: String) -> [String: Any]? { nil }
    override func setPersistentDomain(_ domain: [String: Any], forName name: String) {}
    override func removePersistentDomain(forName name: String) {}
}

private final class DefaultsProvider: NSObject {
    static let memory = MemoryDefaults(suiteName: "local.todo.verification.memory.\(UUID().uuidString)")!
    @objc class func isolatedDefaults() -> UserDefaults { memory }
}

@MainActor enum VerificationDefaults {
    private static var installed = false
    static func install() throws {
        if installed {
            try verificationRequire(UserDefaults.standard === DefaultsProvider.memory, "Memory defaults were replaced after installation.")
            return
        }
        guard let original = class_getClassMethod(UserDefaults.self, NSSelectorFromString("standardUserDefaults")),
              let replacement = class_getClassMethod(DefaultsProvider.self, #selector(DefaultsProvider.isolatedDefaults)) else {
            throw VerificationRefusal(message: "The verification-only memory defaults could not be installed.")
        }
        method_exchangeImplementations(original, replacement)
        installed = true
        try verificationRequire(UserDefaults.standard === DefaultsProvider.memory, "Standard defaults must resolve only to memory in this process.")
    }
}

private final class DirectoryProvider: NSObject {
    @objc func isolatedTemporaryDirectory() -> URL { URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true) }
}

@MainActor enum VerificationDirectories {
    private static var installed = false
    static func install() throws {
        if installed { return }
        guard let original = class_getInstanceMethod(FileManager.self, NSSelectorFromString("temporaryDirectory")),
              let replacement = class_getInstanceMethod(DirectoryProvider.self, #selector(DirectoryProvider.isolatedTemporaryDirectory)) else {
            throw VerificationRefusal(message: "The verification-only temporary directory provider is unavailable.")
        }
        method_exchangeImplementations(original, replacement); installed = true
        try verificationRequire(verificationCanonical(FileManager.default.temporaryDirectory.path) == verificationCanonical(NSTemporaryDirectory()), "Foundation temporary directories must agree with the bound scratch descriptor.")
    }
}

@MainActor enum VerificationProbeScope {
    static func install(serverURL: String = "http://127.0.0.1:1") throws {
        guard let home = ProcessInfo.processInfo.environment["HOME"] else { throw VerificationRefusal(message: "A scratch probe HOME is required.") }
        try verificationRequire(home.hasSuffix("/home"), "A probe HOME must be the scratch home directory.")
        let files = try ScratchFiles(String(home.dropLast(5)))
        _ = try files.open(home, directory: true, privateMode: true)
        let temporary = try files.open(files.root.path + "/tmp", directory: true, privateMode: true)
        bindTemporaryDirectory(temporary.fd)
        try ScratchSandbox.install(root: files.root.path, executable: files.root.path + "/never-execute", serverURL: serverURL)
        try VerificationDirectories.install()
    }
}

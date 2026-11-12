import Foundation

@main struct BootstrapProbe {
    @MainActor static func main() {
        do {
            guard CommandLine.arguments.count == 3 else { exit(2) }
            let files = try ScratchFiles(CommandLine.arguments[1])
            defer { files.releaseSeals() }
            let home = try files.open(files.root.path + "/home", directory: true, privateMode: true)
            _ = try files.open(files.root.path + "/tmp", directory: true, privateMode: true)
            let cli = try files.open(files.root.path + "/todo", immutable: true)
            try cli.seal()
            try verificationRequire(try cli.digest() == VerificationBuild.cliSHA256, "Bootstrap CLI must match the frozen qualification build.")
            _ = try files.open(files.root.path + "/scratch.db", create: true)
            if CommandLine.arguments[2] == "session" {
                let session = try files.open(home.path + "/.todo-cli/session_verify.json", privateMode: true, immutable: true)
                try session.seal()
                let value = try JSONDecoder().decode([String: String].self, from: session.data())
                guard let token = value["token"], token.hasPrefix("ses_") else { exit(78) }
                print(token); return
            }
            let commands: [String: [String]] = ["init": ["init", "--password-stdin"], "login": ["login", "--password-stdin"], "alpha": ["add", "V01 seeded Task alpha"], "beta": ["add", "V01 seeded Task beta"]]
            guard let arguments = commands[CommandLine.arguments[2]] else { exit(2) }
            try files.audit(); try files.verify()
            try ScratchSandbox.install(root: files.root.path, executable: cli.path, serverURL: "http://127.0.0.1:1")
            let child = Process()
            child.executableURL = URL(fileURLWithPath: cli.path)
            child.arguments = arguments + ["--profile", "verify", "--format", "json"]
            child.currentDirectoryURL = URL(fileURLWithPath: files.root.path)
            child.environment = ["HOME": home.path, "CFFIXED_USER_HOME": home.path, "TMPDIR": files.root.path + "/tmp", "TODO_DB": files.root.path + "/scratch.db", "LANG": "C", "LC_ALL": "C"]
            child.standardInput = FileHandle.standardInput
            FileHandle.standardError.write(Data("bootstrap before child start\n".utf8))
            try child.run(); child.waitUntilExit()
            try verificationRequire(child.terminationStatus == 0, "The scratch bootstrap CLI failed.")
            try files.verify(); try files.audit()
        } catch { FileHandle.standardError.write(Data((error.localizedDescription + "\n").utf8)); exit(78) }
    }
}

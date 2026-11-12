import Foundation

@main struct MemoryProbe {
    static func main() throws {
        let vault = MemorySessionVault()
        guard try vault.load() == nil else { exit(1) }
        try vault.save("ses_literal_scratch")
        guard try vault.load() == "ses_literal_scratch" else { exit(1) }
        let another = MemorySessionVault()
        guard try another.load() == nil else { exit(1) }
        try vault.delete()
        guard try vault.load() == nil else { exit(1) }
        print("memory Session load/save/delete and instance isolation passed")
    }
}

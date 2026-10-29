import Foundation

@main
struct ConfigurationDriver {
    static func main() {
        let configuration = ClientConfiguration.load()
        print(configuration.server.absoluteString)
    }
}

// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "TodoAPI",
    platforms: [.macOS(.v26)],
    products: [.library(name: "TodoAPI", targets: ["TodoAPI"]), .executable(name: "PurgeContractProof", targets: ["PurgeContractProof"]), .executable(name: "UnionContractProof", targets: ["UnionContractProof"])],
    dependencies: [
        .package(url: "https://github.com/apple/swift-collections", exact: "1.7.3"),
        .package(url: "https://github.com/apple/swift-openapi-generator", exact: "1.14.2"),
        .package(url: "https://github.com/apple/swift-openapi-runtime", exact: "1.13.3"),
        .package(url: "https://github.com/apple/swift-openapi-urlsession", exact: "1.3.2")
    ],
    targets: [
        // The stall sampler's suspended window, in C so it provably makes no allocation or runtime call.
        .target(name: "ClientStallSampling"),
        .target(name: "TodoAPI", dependencies: [
            "ClientStallSampling",
            .product(name: "OpenAPIRuntime", package: "swift-openapi-runtime"),
            .product(name: "OpenAPIURLSession", package: "swift-openapi-urlsession")
        ]),
        .executableTarget(name: "PurgeContractProof", dependencies: ["TodoAPI"], path: "Verification/PurgeContractProof"),
        .executableTarget(name: "UnionContractProof", dependencies: ["TodoAPI"], path: "Verification/UnionContractProof")
    ]
)

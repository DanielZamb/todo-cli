// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "TodoStateProof",
    platforms: [.macOS(.v26)],
    dependencies: [.package(path: "API")],
    targets: [
        .target(name: "TodoState", dependencies: [.product(name: "TodoAPI", package: "API")], path: "Sources", exclude: [
            "TodoApp.swift"
        ]),
        .testTarget(name: "GeneratedContractTests", dependencies: ["TodoState", .product(name: "TodoAPI", package: "API")], path: "Tests", exclude: ["NativeBehaviorTests.swift", "NotificationPermissionTests.swift"], sources: ["GeneratedContractTests.swift"]),
        .testTarget(name: "WriteStateTests", dependencies: ["TodoState"], path: "StateTests"),
        .testTarget(name: "DesignSnapshots", dependencies: ["TodoState"], path: "DesignSnapshots")
    ]
)

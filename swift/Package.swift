// swift-tools-version: 6.0
// The swift-tools-version declares the minimum version of Swift required to build this package.

import PackageDescription

let package = Package(
    name: "Nitroping",
    platforms: [
        .iOS(.v16),
        .macOS(.v13),
        .watchOS(.v9),
        .tvOS(.v16),
        .visionOS(.v1)
    ],
    products: [
        .library(
            name: "Nitroping",
            targets: ["Nitroping"]
        )
    ],
    dependencies: [],
    targets: [
        .target(
            name: "Nitroping",
            dependencies: [],
            path: "Sources/Nitroping"
        ),
        .testTarget(
            name: "NitropingTests",
            dependencies: ["Nitroping"],
            path: "Tests/NitropingTests"
        )
    ]
)

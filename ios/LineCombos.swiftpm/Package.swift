// swift-tools-version: 5.9
import PackageDescription
import AppleProductTypes

// Open this folder in Xcode 15+ (File > Open) or Swift Playgrounds 4.4+ on iPad. No project file needed.
let package = Package(
    name: "LineCombos",
    platforms: [.iOS("17.0")],
    products: [
        .iOSApplication(
            name: "LineCombos",
            targets: ["AppModule"],
            bundleIdentifier: "app.linecombos.prototype",
            displayVersion: "0.1",
            bundleVersion: "1",
            appIcon: .placeholder(icon: .bolt),
            accentColor: .presetColor(.blue),
            supportedDeviceOrientations: [.portrait, .landscapeLeft, .landscapeRight],
            capabilities: [.outgoingNetworkConnections()]
        )
    ],
    targets: [
        .executableTarget(name: "AppModule", path: "Sources")
    ]
)

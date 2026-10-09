// swift-tools-version: 5.9
import PackageDescription

let package = Package(
  name: "PraetoriumWatchState",
  products: [.library(name: "PraetoriumWatchState", targets: ["PraetoriumWatchState"])],
  targets: [
    .target(
      name: "PraetoriumWatchState", path: ".",
      exclude: [
        "CompanionView.swift", "PraetoriumWatchApp.swift", "WatchStore.swift", "Tests",
        "PrivacyInfo.xcprivacy",
      ],
      sources: ["BattleSnapshot.swift", "BattleSession.swift"],
      resources: [.copy("demo-battle.json")]),
    .testTarget(
      name: "PraetoriumWatchStateTests", dependencies: ["PraetoriumWatchState"], path: "Tests"),
  ]
)

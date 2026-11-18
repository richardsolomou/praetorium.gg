import ActivityKit
import Foundation

/// The battle a Live Activity follows. The app module and the widget extension each compile this file, and ActivityKit
/// matches the two by type name and coding keys, so they must stay one file.
struct BattleActivityAttributes: ActivityAttributes {
  struct ContentState: Codable, Hashable {
    var round: Int
    var rounds: Int
    var phase: String
    var activeSide: Int?
    var paused: Bool
    /// When the turn clock read zero, while it runs; the system ticks it from here without another update.
    var turnStartedAt: Date?
    var turnElapsedMs: Double
    var finished: Bool
    var updatedAt: Date
    var sides: [Side]
  }

  struct Side: Codable, Hashable {
    var index: Int
    var name: String
    var yours: Bool
    var vp: Int
    var cp: Int
  }

  var battleId: String
  var url: String
}

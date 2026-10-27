import Foundation

struct BattleSnapshot: Decodable {
  let version: Int
  let battleId: String
  let viewerId: String
  let liveUrl: String?
  var status: String?
  var seq: Int
  var updatedAt: Double
  var round: Int
  var rounds: Int
  var phase: String
  var activeSide: Int?
  var paused: Bool
  var turnElapsedMs: Double
  var turnRunning: Bool
  var sides: [BattleSide]
  let objectives: [BattleObjective]
  var reminders: [BattleReminder]
  var moreReminders: Int

  static let maxBytes = 48_000

  static func decode(_ string: String) -> BattleSnapshot? {
    guard let data = string.data(using: .utf8), data.count <= maxBytes,
      let snapshot = try? JSONDecoder().decode(Self.self, from: data),
      snapshot.version == 1, snapshot.sides.count <= 2,
      snapshot.objectives.count <= 10, snapshot.reminders.count <= 20,
      validMs(snapshot.updatedAt), validMs(snapshot.turnElapsedMs),
      snapshot.moreReminders >= 0,
      snapshot.sides.allSatisfy({ validScore($0.vp) && validScore($0.cp) }),
      snapshot.objectives.allSatisfy({ validScore($0.points) })
    else { return nil }
    return snapshot
  }

  var identity: String { "\(viewerId):\(battleId)" }
  var active: BattleSide? { sides.first { $0.index == activeSide } }
  /// A battle followed from the stands: nothing on the table is the viewer's.
  var spectating: Bool { !sides.contains { $0.yours } }
  var finished: Bool { status == "finished" }

  /// The live endpoint the phone named, held to HTTPS outside debug builds.
  var liveURL: URL? {
    guard status == nil || status == "playing", let liveUrl, let url = URL(string: liveUrl),
      url.host != nil
    else { return nil }
    #if DEBUG
      return ["https", "http"].contains(url.scheme) ? url : nil
    #else
      return url.scheme == "https" ? url : nil
    #endif
  }

  /// Battle state orders by `seq`; `updatedAt` only breaks a tie between two reads of one state.
  func isSuperseded(bySeq seq: Int, updatedAt: Double) -> Bool {
    seq > self.seq || (seq == self.seq && updatedAt >= self.updatedAt)
  }
  func age(at date: Date) -> Double { max(0, date.timeIntervalSince1970 - updatedAt / 1000) }
  func isFresh(at date: Date) -> Bool { age(at: date) <= 45 }
  func elapsed(at date: Date) -> Double {
    turnElapsedMs / 1000 + (turnRunning ? min(age(at: date), 45) : 0)
  }

  func elapsedLabel(at date: Date, showsSeconds: Bool = true) -> String {
    let total = Int64(max(0, elapsed(at: date)))
    if !showsSeconds { return "\(total / 60)m" }
    if total >= 3600 {
      return String(format: "%lld:%02lld:%02lld", total / 3600, (total / 60) % 60, total % 60)
    }
    return String(format: "%02lld:%02lld", total / 60, total % 60)
  }
}

struct BattleSide: Decodable, Identifiable {
  let index: Int
  let name: String
  let yours: Bool
  var vp: Double
  var cp: Double
  var id: Int { index }
}

/// What the live endpoint answers: the counters anyone who may watch the battle can read.
struct LiveBattle: Decodable {
  let seq: Int
  let status: String
  let round: Int
  let rounds: Int
  let phase: String
  let activeSide: Int?
  let paused: Bool
  let turnElapsedMs: Double
  let turnRunning: Bool
  let sides: [Side]

  struct Side: Decodable {
    let index: Int
    let vp: Double
    let cp: Double
  }

  static func decode(_ data: Data) -> LiveBattle? {
    guard data.count <= 4_096, let live = try? JSONDecoder().decode(Self.self, from: data),
      live.seq >= 0, live.sides.count <= 2, validMs(live.turnElapsedMs),
      live.sides.allSatisfy({ validScore($0.vp) && validScore($0.cp) })
    else { return nil }
    return live
  }
}

private func validMs(_ value: Double) -> Bool {
  value.isFinite && value >= 0 && value <= 9_007_199_254_740_991
}
private func validScore(_ value: Double) -> Bool {
  value.isFinite && value >= 0 && value <= 1_000_000
}

struct BattleObjective: Decodable, Identifiable {
  let id: String
  let name: String
  let kind: String
  let points: Double
  let summary: String
}

struct BattleReminder: Decodable, Identifiable {
  let id: String
  let title: String
  let unit: String?
  let moment: String
  let description: String
}

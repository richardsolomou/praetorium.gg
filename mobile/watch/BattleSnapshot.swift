import Foundation

struct BattleSnapshot: Decodable {
  let version: Int
  let battleId: String
  let viewerId: String
  let seq: Int
  let updatedAt: Double
  let round: Int
  let rounds: Int
  let phase: String
  let activeSide: Int?
  let paused: Bool
  let turnElapsedMs: Double
  let turnRunning: Bool
  let sides: [BattleSide]
  let objectives: [BattleObjective]
  let reminders: [BattleReminder]
  let moreReminders: Int

  static func decode(_ string: String) -> BattleSnapshot? {
    guard let data = string.data(using: .utf8), data.count <= 48_000,
      let snapshot = try? JSONDecoder().decode(Self.self, from: data),
      snapshot.version == 1, snapshot.sides.count <= 2,
      snapshot.objectives.count <= 10, snapshot.reminders.count <= 20,
      snapshot.updatedAt.isFinite, snapshot.updatedAt >= 0,
      snapshot.turnElapsedMs.isFinite, snapshot.turnElapsedMs >= 0,
      snapshot.moreReminders >= 0,
      snapshot.turnElapsedMs <= 9_007_199_254_740_991,
      snapshot.updatedAt <= 9_007_199_254_740_991,
      snapshot.sides.allSatisfy({ side in
        side.vp.isFinite && side.cp.isFinite && side.vp >= 0 && side.vp <= 1_000_000 && side.cp >= 0
          && side.cp <= 1_000_000
      }),
      snapshot.objectives.allSatisfy({
        $0.points.isFinite && $0.points >= 0 && $0.points <= 1_000_000
      })
    else { return nil }
    return snapshot
  }

  var identity: String { "\(viewerId):\(battleId)" }
  var active: BattleSide? { sides.first { $0.index == activeSide } }
  func age(at date: Date) -> Double { max(0, date.timeIntervalSince1970 - updatedAt / 1000) }
  func isFresh(at date: Date) -> Bool { age(at: date) <= 45 }
  func elapsed(at date: Date) -> Double {
    turnElapsedMs / 1000 + (turnRunning ? min(age(at: date), 45) : 0)
  }

  func elapsedLabel(at date: Date) -> String {
    let total = Int64(max(0, elapsed(at: date)))
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
  let vp: Double
  let cp: Double
  var id: Int { index }
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

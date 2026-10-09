import Foundation

struct BattleSession {
  private(set) var battle: BattleSnapshot?
  private(set) var dismissed: Set<String> = []
  private(set) var deliveredAt: Double = 0

  var reminders: [BattleReminder] {
    battle?.reminders.filter { !dismissed.contains($0.id) } ?? []
  }

  mutating func dismiss(_ reminder: BattleReminder) {
    dismissed.insert(reminder.id)
  }

  mutating func receive(_ snapshot: BattleSnapshot?, deliveredAt: Double) -> Bool {
    guard deliveredAt.isFinite, deliveredAt >= self.deliveredAt else { return false }
    self.deliveredAt = deliveredAt
    guard let snapshot else {
      battle = nil
      dismissed = []
      return false
    }
    if let current = battle, current.identity == snapshot.identity,
      snapshot.updatedAt < current.updatedAt
    {
      return false
    }
    let previous = battle
    if previous?.identity != snapshot.identity { dismissed = [] }
    dismissed.formIntersection(Set(snapshot.reminders.map(\.id)))
    let oldIds = Set(previous?.reminders.map(\.id) ?? [])
    let hasNewReminders = snapshot.reminders.contains {
      !oldIds.contains($0.id) && !dismissed.contains($0.id)
    }
    battle = snapshot
    return previous?.identity == snapshot.identity && hasNewReminders
  }
}

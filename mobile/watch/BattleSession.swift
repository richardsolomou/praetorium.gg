import Foundation

struct BattleSession {
  private(set) var battle: BattleSnapshot?
  private(set) var dismissed: Set<String> = []
  private(set) var deliveredAt: Double = 0
  /// When the battle state the phone last sent was read, which says whether the phone is still keeping up.
  private(set) var phoneUpdatedAt: Double = 0

  var reminders: [BattleReminder] {
    battle?.reminders.filter { !dismissed.contains($0.id) } ?? []
  }

  /// The battle the watch should read for itself, once the phone has gone quiet for `after` seconds.
  func liveURL(at date: Date, after quiet: Double) -> URL? {
    guard date.timeIntervalSince1970 - phoneUpdatedAt / 1000 > quiet else { return nil }
    return battle?.liveURL
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
      phoneUpdatedAt = 0
      return false
    }
    if let current = battle, current.identity == snapshot.identity,
      !current.isSuperseded(bySeq: snapshot.seq, updatedAt: snapshot.updatedAt)
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
    phoneUpdatedAt = snapshot.updatedAt
    return previous?.identity == snapshot.identity && hasNewReminders
  }

  /// Takes the server's counters into the battle the phone sent, keeping the phone's names and private cards.
  /// `receivedAt` is this watch's clock, so the turn timer never mixes in the server's.
  @discardableResult
  mutating func receive(_ live: LiveBattle, for battleId: String, receivedAt: Double) -> Bool {
    guard var next = battle, next.battleId == battleId,
      next.isSuperseded(bySeq: live.seq, updatedAt: receivedAt),
      live.sides.map(\.index) == next.sides.map(\.index)
    else { return false }
    // A reminder belongs to the moment the phone raised it; once the turn moves on, it is the phone's to raise again.
    if (live.round, live.phase, live.activeSide) != (next.round, next.phase, next.activeSide) {
      next.reminders = []
      next.moreReminders = 0
    }
    next.seq = live.seq
    next.updatedAt = receivedAt
    next.status = live.status
    next.round = live.round
    next.rounds = live.rounds
    next.phase = live.phase
    next.activeSide = live.activeSide
    next.paused = live.paused
    next.turnElapsedMs = live.turnElapsedMs
    next.turnRunning = live.turnRunning
    for (index, side) in live.sides.enumerated() {
      next.sides[index].vp = side.vp
      next.sides[index].cp = side.cp
    }
    battle = next
    return true
  }
}

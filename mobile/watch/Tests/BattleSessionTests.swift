import Foundation
import XCTest

@testable import PraetoriumWatchState

final class BattleSessionTests: XCTestCase {
  private func snapshot(_ patch: [String: Any] = [:]) throws -> BattleSnapshot {
    let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
      .deletingLastPathComponent().appendingPathComponent("demo-battle.json")
    var object = try XCTUnwrap(
      JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
    for (key, value) in patch { object[key] = value }
    guard
      let snapshot = BattleSnapshot.decode(
        String(decoding: try JSONSerialization.data(withJSONObject: object), as: UTF8.self))
    else {
      throw NSError(domain: "InvalidSnapshot", code: 1)
    }
    return snapshot
  }

  func testFreshClockBecomesSavedAndStopsEstimatingAfter45Seconds() throws {
    let battle = try snapshot(["updatedAt": 100_000, "turnElapsedMs": 10_000])
    XCTAssertEqual(
      [
        battle.elapsed(at: Date(timeIntervalSince1970: 120)),
        battle.elapsed(at: Date(timeIntervalSince1970: 145)),
        battle.elapsed(at: Date(timeIntervalSince1970: 200)),
      ], [30, 55, 55])
    XCTAssertFalse(battle.isFresh(at: Date(timeIntervalSince1970: 146)))
  }

  func testPausedClockDoesNotAccrueTime() throws {
    let battle = try snapshot([
      "updatedAt": 100_000, "turnRunning": false, "paused": true, "turnElapsedMs": 10_000,
    ])
    XCTAssertEqual(battle.elapsed(at: Date(timeIntervalSince1970: 130)), 10)
  }

  func testLongTurnUsesHoursWhileShortTurnUsesMinutes() throws {
    let short = try snapshot(["turnRunning": false, "turnElapsedMs": 754_000])
    let long = try snapshot(["turnRunning": false, "turnElapsedMs": 14_280_000])
    let now = Date(timeIntervalSince1970: 100)
    XCTAssertEqual(
      [short.elapsedLabel(at: now), long.elapsedLabel(at: now)], ["12:34", "3:58:00"])
  }

  func testReducedDisplayOmitsSecondsForShortAndLongTurns() throws {
    let now = Date(timeIntervalSince1970: 100)
    let labels = try [0.0, 59_000, 60_000, 754_000, 14_280_000].map { elapsed in
      try snapshot(["turnRunning": false, "turnElapsedMs": elapsed])
        .elapsedLabel(at: now, showsSeconds: false)
    }
    XCTAssertEqual(labels, ["0m", "0m", "1m", "12m", "238m"])
  }

  func testReducedDisplayStillStopsEstimatingWhenSnapshotIsSaved() throws {
    let battle = try snapshot(["updatedAt": 100_000, "turnElapsedMs": 90_000])
    XCTAssertEqual(
      [120.0, 145, 400].map {
        battle.elapsedLabel(at: Date(timeIntervalSince1970: $0), showsSeconds: false)
      }, ["1m", "2m", "2m"])
  }

  func testWatchDismissalSurvivesRefreshOfSameReminder() throws {
    var session = BattleSession()
    let battle = try snapshot()
    _ = session.receive(battle, deliveredAt: 1)
    session.dismiss(battle.reminders[0])
    _ = session.receive(try snapshot(["seq": 43]), deliveredAt: 2)
    XCTAssertEqual(session.reminders.map(\.id), [battle.reminders[1].id])
  }

  func testNextPhaseCanShowTheReminderAgain() throws {
    var session = BattleSession()
    let battle = try snapshot()
    _ = session.receive(battle, deliveredAt: 1)
    session.dismiss(battle.reminders[0])
    _ = session.receive(try snapshot(["reminders": []]), deliveredAt: 2)
    _ = session.receive(battle, deliveredAt: 3)
    XCTAssertEqual(session.reminders.count, 2)
  }

  func testAccountSwitchClearsDismissals() throws {
    var session = BattleSession()
    let battle = try snapshot()
    _ = session.receive(battle, deliveredAt: 1)
    session.dismiss(battle.reminders[0])
    _ = session.receive(try snapshot(["viewerId": "another-player"]), deliveredAt: 2)
    XCTAssertEqual(session.reminders.count, 2)
  }

  func testOlderInteractiveDeliveryCannotRestoreClearedPrivateState() throws {
    var session = BattleSession()
    let battle = try snapshot()
    _ = session.receive(battle, deliveredAt: 1)
    _ = session.receive(nil, deliveredAt: 3)
    _ = session.receive(battle, deliveredAt: 2)
    XCTAssertNil(session.battle)
  }

  func testUnrelatedScoreRefreshDoesNotTriggerReminderTap() throws {
    var session = BattleSession()
    _ = session.receive(try snapshot(), deliveredAt: 1)
    XCTAssertFalse(session.receive(try snapshot(["seq": 43]), deliveredAt: 2))
  }

  func testNewReminderTriggersOneTapAfterInitialLoad() throws {
    var session = BattleSession()
    _ = session.receive(try snapshot(["reminders": []]), deliveredAt: 1)
    XCTAssertTrue(session.receive(try snapshot(), deliveredAt: 2))
  }

  func testRejectsUnsupportedSnapshotVersion() throws {
    XCTAssertThrowsError(try snapshot(["version": 2]))
  }
}

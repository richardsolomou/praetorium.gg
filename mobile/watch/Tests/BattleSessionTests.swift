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

  private func liveData(_ patch: [String: Any] = [:]) throws -> Data {
    var object: [String: Any] = [
      "seq": 43, "updatedAt": 0, "status": "playing", "round": 3, "rounds": 5,
      "phase": "shooting", "activeSide": 0, "paused": false, "turnElapsedMs": 800_000,
      "turnRunning": true,
      "sides": [["index": 0, "vp": 40, "cp": 3], ["index": 1, "vp": 28, "cp": 2]],
    ]
    for (key, value) in patch { object[key] = value }
    return try JSONSerialization.data(withJSONObject: object)
  }

  private func live(_ patch: [String: Any] = [:]) throws -> LiveBattle {
    try XCTUnwrap(LiveBattle.decode(try liveData(patch)))
  }

  private let liveUrl = "https://praetorium.gg/api/watch/battles/simulator-demo"

  func testLiveReadUpdatesTheScoreAndKeepsThePhonesCards() throws {
    var session = BattleSession()
    _ = session.receive(try snapshot(["updatedAt": 1_000]), deliveredAt: 1)
    session.receive(try live(), for: "simulator-demo", receivedAt: 2_000)
    XCTAssertEqual(
      [session.battle?.sides.map(\.vp), session.battle?.sides.map(\.cp)],
      [[40, 28], [3, 2]])
    XCTAssertEqual(session.battle?.objectives.count, 3)
  }

  func testLiveReadOfAnotherBattleIsIgnored() throws {
    var session = BattleSession()
    _ = session.receive(try snapshot(), deliveredAt: 1)
    XCTAssertFalse(session.receive(try live(), for: "another-battle", receivedAt: 2_000))
  }

  func testLiveReadBehindThePhoneIsIgnored() throws {
    var session = BattleSession()
    _ = session.receive(try snapshot(["updatedAt": 1_000]), deliveredAt: 1)
    XCTAssertFalse(session.receive(try live(["seq": 41]), for: "simulator-demo", receivedAt: 9_000))
  }

  func testPhoneSnapshotBehindALiveReadIsIgnored() throws {
    var session = BattleSession()
    _ = session.receive(try snapshot(["updatedAt": 1_000]), deliveredAt: 1)
    session.receive(try live(["seq": 50]), for: "simulator-demo", receivedAt: 2_000)
    _ = session.receive(try snapshot(["seq": 49, "updatedAt": 3_000]), deliveredAt: 2)
    XCTAssertEqual(session.battle?.seq, 50)
  }

  func testLiveReadOfALaterTurnDropsThePhonesReminders() throws {
    var session = BattleSession()
    _ = session.receive(try snapshot(["updatedAt": 1_000]), deliveredAt: 1)
    session.receive(try live(["activeSide": 1]), for: "simulator-demo", receivedAt: 2_000)
    XCTAssertTrue(session.reminders.isEmpty)
  }

  func testWatchReadsForItselfOnlyOnceThePhoneGoesQuiet() throws {
    var session = BattleSession()
    _ = session.receive(try snapshot(["updatedAt": 100_000, "liveUrl": liveUrl]), deliveredAt: 1)
    XCTAssertEqual(
      [110.0, 120].map {
        session.liveURL(at: Date(timeIntervalSince1970: $0), after: 15)?.absoluteString
      }, [nil, liveUrl])
  }

  func testWatchKeepsReadingWhileItsOwnReadsAreFresh() throws {
    var session = BattleSession()
    _ = session.receive(try snapshot(["updatedAt": 100_000, "liveUrl": liveUrl]), deliveredAt: 1)
    session.receive(try live(), for: "simulator-demo", receivedAt: 120_000)
    XCTAssertNotNil(session.liveURL(at: Date(timeIntervalSince1970: 125), after: 15))
  }

  func testFinishedBattleStopsTheLiveReads() throws {
    var session = BattleSession()
    _ = session.receive(try snapshot(["updatedAt": 100_000, "liveUrl": liveUrl]), deliveredAt: 1)
    session.receive(try live(["status": "finished"]), for: "simulator-demo", receivedAt: 120_000)
    XCTAssertNil(session.liveURL(at: Date(timeIntervalSince1970: 200), after: 15))
  }

  func testLiveAddressMustBeAWebAddress() throws {
    XCTAssertNil(
      try snapshot(["liveUrl": "ftp://praetorium.gg/api/watch/battles/simulator-demo"]).liveURL)
  }

  func testRejectsALiveReadWithAnImpossibleScore() throws {
    XCTAssertNil(LiveBattle.decode(try liveData(["sides": [["index": 0, "vp": -1, "cp": 0]]])))
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

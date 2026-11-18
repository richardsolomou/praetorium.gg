import ActivityKit
import ExpoModulesCore

public class PraetoriumBattleActivityModule: Module {
  private var watching: Task<Void, Never>?

  public func definition() -> ModuleDefinition {
    Name("PraetoriumBattleActivity")
    Events("enabledChanged")
    OnStartObserving {
      self.watching = Task { [weak self] in
        for await enabled in ActivityAuthorizationInfo().activityEnablementUpdates {
          self?.sendEvent("enabledChanged", ["enabled": enabled])
        }
      }
    }
    OnStopObserving {
      self.watching?.cancel()
      self.watching = nil
    }
    Function("isEnabled") { ActivityAuthorizationInfo().areActivitiesEnabled }
    AsyncFunction("show") { (payload: String) async throws in
      try await BattleActivities.show(BattleActivities.decode(payload))
    }
    AsyncFunction("end") { (payload: String?) async throws in
      try await BattleActivities.end(payload.map(BattleActivities.decode))
    }
  }
}

private struct BattleActivityPayload: Decodable {
  let battleId: String
  let url: String
  let state: BattleActivityAttributes.ContentState
}

private enum BattleActivities {
  static func decode(_ payload: String) throws -> BattleActivityPayload {
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .millisecondsSince1970
    return try decoder.decode(BattleActivityPayload.self, from: Data(payload.utf8))
  }

  /// Updates the battle's activity, or replaces whichever other battle's is showing with a new one.
  static func show(_ payload: BattleActivityPayload) async throws {
    let content = ActivityContent(state: payload.state, staleDate: nil)
    var shown = false
    for activity in Activity<BattleActivityAttributes>.activities {
      if activity.attributes.battleId == payload.battleId && !shown {
        await activity.update(content)
        shown = true
      } else {
        await activity.end(nil, dismissalPolicy: .immediate)
      }
    }
    if shown || !ActivityAuthorizationInfo().areActivitiesEnabled { return }
    _ = try Activity.request(
      attributes: BattleActivityAttributes(battleId: payload.battleId, url: payload.url),
      content: content)
  }

  /// Ends every activity; one for the finished battle `final` names keeps its final score on the Lock Screen a while.
  static func end(_ final: BattleActivityPayload?) async throws {
    for activity in Activity<BattleActivityAttributes>.activities {
      if let final, activity.attributes.battleId == final.battleId {
        await activity.end(
          ActivityContent(state: final.state, staleDate: nil), dismissalPolicy: .default)
      } else {
        await activity.end(nil, dismissalPolicy: .immediate)
      }
    }
  }
}

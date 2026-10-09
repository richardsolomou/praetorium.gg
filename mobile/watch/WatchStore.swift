import SwiftUI
import WatchConnectivity
import WatchKit
import os

final class WatchStore: NSObject, ObservableObject, WCSessionDelegate {
  @Published private var state = BattleSession()
  var battle: BattleSnapshot? { state.battle }
  @Published var connectionError: String?
  private let logger = Logger(subsystem: "gg.praetorium.watch", category: "sync")
  private var activationFinished = false

  override init() {
    super.init()
    #if DEBUG
      if ProcessInfo.processInfo.arguments.contains("--demo") {
        loadDemo()
        return
      }
    #endif
    WCSession.default.delegate = self
    WCSession.default.activate()
  }

  var reminders: [BattleReminder] { state.reminders }

  func dismiss(_ reminder: BattleReminder) { state.dismiss(reminder) }

  @MainActor
  func refreshInBackground() async {
    #if DEBUG
      if ProcessInfo.processInfo.arguments.contains("--demo") { return }
    #endif
    let session = WCSession.default
    // Keep the system task alive until activation and queued delivery finish.
    while !activationFinished
      || (session.activationState == .activated && session.hasContentPending)
    {
      do { try await Task.sleep(for: .milliseconds(100)) } catch { return }
    }
    let context = session.receivedApplicationContext
    guard !Task.isCancelled, session.activationState == .activated,
      let snapshot = decodeContext(context)
    else { return }
    receive(
      snapshot, deliveredAt: context["sentAt"] as? Double ?? 0,
      notify: false)
  }

  func receive(_ string: String, deliveredAt: Double, notify: Bool = true) {
    let next = string.isEmpty ? nil : BattleSnapshot.decode(string)
    guard string.isEmpty || next != nil else {
      connectionError = "Open Praetorium on your iPhone to refresh."
      return
    }
    let hasNewReminders = state.receive(next, deliveredAt: deliveredAt)
    connectionError = nil
    if notify, hasNewReminders, next?.isFresh(at: Date()) == true,
      UserDefaults.standard.bool(forKey: "reminderHaptics"),
      WKApplication.shared().applicationState == .active
    {
      WKInterfaceDevice.current().play(.notification)
    }
  }

  func session(
    _ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState,
    error: Error?
  ) {
    let context = session.receivedApplicationContext
    let snapshot = decodeContext(context)
    let deliveredAt = context["sentAt"] as? Double ?? 0
    DispatchQueue.main.async { [self] in
      activationFinished = true
      if let error {
        logger.error("Watch activation failed: \(error.localizedDescription, privacy: .public)")
        connectionError = "Open Praetorium on your iPhone to connect."
      } else if let snapshot {
        receive(snapshot, deliveredAt: deliveredAt, notify: false)
      }
    }
  }

  func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any])
  {
    guard let snapshot = decodeContext(applicationContext) else { return }
    let deliveredAt = applicationContext["sentAt"] as? Double ?? 0
    DispatchQueue.main.async { self.receive(snapshot, deliveredAt: deliveredAt) }
  }

  func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
    guard let snapshot = decodeContext(message) else { return }
    let deliveredAt = message["sentAt"] as? Double ?? 0
    DispatchQueue.main.async { self.receive(snapshot, deliveredAt: deliveredAt) }
  }

  private func decodeContext(_ context: [String: Any]) -> String? {
    guard let data = context["snapshot"] as? Data, data.count <= 48_000 else { return nil }
    return String(data: data, encoding: .utf8)
  }

  #if DEBUG
    private func loadDemo() {
      guard let url = Bundle.main.url(forResource: "demo-battle", withExtension: "json"),
        let data = try? Data(contentsOf: url),
        var object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
      else { return }
      object["updatedAt"] = Date().timeIntervalSince1970 * 1000
      if ProcessInfo.processInfo.arguments.contains("--stale") {
        object["updatedAt"] = (Date().timeIntervalSince1970 - 180) * 1000
      }
      guard let adjusted = try? JSONSerialization.data(withJSONObject: object),
        let string = String(data: adjusted, encoding: .utf8)
      else { return }
      receive(string, deliveredAt: Date().timeIntervalSince1970, notify: false)
    }
  #endif
}

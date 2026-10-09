import ExpoModulesCore
import WatchConnectivity
import os

public class PraetoriumWatchModule: Module {
  private let transport = WatchTransport()

  public func definition() -> ModuleDefinition {
    Name("PraetoriumWatch")
    Events("availabilityChanged")
    OnCreate {
      self.transport.availabilityChanged = { [weak self] in
        guard let self else { return }
        self.sendEvent("availabilityChanged", ["available": self.transport.isAvailable])
      }
      self.transport.start()
    }
    Function("isAvailable") { self.transport.isAvailable }
    AsyncFunction("publish") { (snapshot: String) in
      try self.transport.publish(snapshot)
    }.runOnQueue(.main)
  }
}

private final class WatchTransport: NSObject, WCSessionDelegate {
  var availabilityChanged: (() -> Void)?
  var isAvailable: Bool {
    WCSession.isSupported() && WCSession.default.activationState == .activated
      && WCSession.default.isPaired && WCSession.default.isWatchAppInstalled
  }
  private var latest = ""
  private var sentAt: Double = 0
  private let logger = Logger(subsystem: "gg.praetorium", category: "watch")

  func start() {
    guard WCSession.isSupported() else { return }
    WCSession.default.delegate = self
    WCSession.default.activate()
  }

  func publish(_ snapshot: String) throws {
    guard snapshot.utf8.count <= 48_000 else {
      throw NSError(
        domain: "PraetoriumWatch", code: 1,
        userInfo: [NSLocalizedDescriptionKey: "Watch snapshot is too large"])
    }
    guard isAvailable else {
      latest = ""
      return
    }
    latest = snapshot
    sentAt = max(sentAt + 0.001, Date().timeIntervalSince1970)
    try WCSession.default.updateApplicationContext([
      "snapshot": Data(snapshot.utf8), "sentAt": sentAt,
    ])
    if WCSession.default.isReachable {
      WCSession.default.sendMessage(
        ["snapshot": Data(snapshot.utf8), "sentAt": sentAt], replyHandler: nil
      ) {
        [logger] error in
        logger.error(
          "Watch delivery deferred to application context: \(error.localizedDescription, privacy: .public)"
        )
      }
    }
  }

  func session(
    _ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState,
    error: Error?
  ) {
    DispatchQueue.main.async { [self] in
      availabilityChanged?()
      if let error {
        logger.error("Watch activation failed: \(error.localizedDescription, privacy: .public)")
        return
      }
      do { try publish(latest) } catch {
        logger.error("Watch context failed: \(error.localizedDescription, privacy: .public)")
      }
    }
  }

  func sessionReachabilityDidChange(_ session: WCSession) {
    DispatchQueue.main.async { [self] in
      do { try publish(latest) } catch {
        logger.error("Watch context failed: \(error.localizedDescription, privacy: .public)")
      }
    }
  }

  func sessionWatchStateDidChange(_ session: WCSession) {
    DispatchQueue.main.async { [self] in
      if !isAvailable { latest = "" }
      availabilityChanged?()
      do { try publish(latest) } catch {
        logger.error("Watch context failed: \(error.localizedDescription, privacy: .public)")
      }
    }
  }

  func sessionDidBecomeInactive(_ session: WCSession) {
    DispatchQueue.main.async { [self] in
      latest = ""
      availabilityChanged?()
    }
  }
  func sessionDidDeactivate(_ session: WCSession) { session.activate() }
}

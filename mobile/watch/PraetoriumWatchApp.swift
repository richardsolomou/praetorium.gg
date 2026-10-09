import SwiftUI

@main
struct PraetoriumWatchApp: App {
  @StateObject private var store = WatchStore()

  var body: some Scene {
    WindowGroup {
      CompanionView()
        .environmentObject(store)
        .preferredColorScheme(.dark)
    }
  }
}

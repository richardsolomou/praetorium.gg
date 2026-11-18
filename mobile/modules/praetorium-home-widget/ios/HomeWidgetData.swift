import Foundation

/// What the home screen widget shows. The app module writes it and the widget extension reads it, each compiling
/// this one file, through the App Group both are entitled to.
struct HomeWidgetData: Codable {
  struct Item: Codable, Hashable {
    let kind: String
    let title: String
    let detail: String
    let url: String
    let due: Date?
    let urgent: Bool
  }

  let updatedAt: Date
  let items: [Item]

  static let kind = "HomeWidget"
  private static let key = "homeWidget"
  private static var defaults: UserDefaults? { UserDefaults(suiteName: "group.gg.praetorium") }

  /// The saved widget; nil once the player has signed out, or before the app has saved one.
  static func read() -> HomeWidgetData? {
    guard let data = defaults?.data(forKey: key) else { return nil }
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .millisecondsSince1970
    return try? decoder.decode(Self.self, from: data)
  }

  static func write(_ json: String?) {
    defaults?.set(json.map { Data($0.utf8) }, forKey: key)
  }
}

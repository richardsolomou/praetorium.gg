import SwiftUI
import WidgetKit

private let panel = Color(red: 0.05, green: 0.07, blue: 0.09)
private let accent = Color(red: 0.61, green: 0.82, blue: 0.66)
private let urgent = Color(red: 0.95, green: 0.65, blue: 0.35)

struct HomeWidgetEntry: TimelineEntry {
  let date: Date
  let data: HomeWidgetData?
}

struct HomeWidgetTimeline: TimelineProvider {
  func placeholder(in context: Context) -> HomeWidgetEntry {
    HomeWidgetEntry(date: .now, data: .sample)
  }

  func getSnapshot(in context: Context, completion: @escaping (HomeWidgetEntry) -> Void) {
    completion(
      HomeWidgetEntry(date: .now, data: context.isPreview ? .sample : HomeWidgetData.read()))
  }

  /// Hourly entries keep each deadline's "in 3 hours" current until the app saves a newer picture.
  func getTimeline(in context: Context, completion: @escaping (Timeline<HomeWidgetEntry>) -> Void) {
    let data = HomeWidgetData.read()
    let entries = (0..<6).map { hour in
      HomeWidgetEntry(date: Date.now.addingTimeInterval(Double(hour) * 3600), data: data)
    }
    completion(Timeline(entries: entries, policy: .atEnd))
  }
}

struct HomeWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: HomeWidgetData.kind, provider: HomeWidgetTimeline()) { entry in
      HomeWidgetView(entry: entry)
    }
    .configurationDisplayName("Up next")
    .description("Your games, league games and tournaments waiting on you.")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}

private struct HomeWidgetView: View {
  @Environment(\.widgetFamily) private var family
  let entry: HomeWidgetEntry

  private var items: [HomeWidgetData.Item] {
    Array((entry.data?.items ?? []).prefix(family == .systemSmall ? 1 : 3))
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("UP NEXT").font(.system(size: 11, weight: .bold)).tracking(1).foregroundStyle(accent)
      if items.isEmpty {
        Text(
          entry.data == nil
            ? "Sign in to Praetorium to see your games here." : "Nothing is waiting on you."
        )
        .font(.footnote).foregroundStyle(.secondary)
        Spacer(minLength: 0)
      } else {
        ForEach(items, id: \.self) { item in
          Link(destination: URL(string: item.url)!) { ItemRow(item: item, now: entry.date) }
        }
        Spacer(minLength: 0)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .foregroundStyle(.white)
    // A tap outside any line, and every tap on the small size, opens the most pressing one.
    .widgetURL(items.first.flatMap { URL(string: $0.url) })
    .widgetBackground(panel)
  }
}

private struct ItemRow: View {
  let item: HomeWidgetData.Item
  let now: Date

  var body: some View {
    HStack(alignment: .top, spacing: 8) {
      Image(systemName: symbol).font(.system(size: 13, weight: .semibold))
        .foregroundStyle(item.urgent ? urgent : accent).frame(width: 16)
      VStack(alignment: .leading, spacing: 1) {
        Text(item.title).font(.subheadline.weight(.semibold)).lineLimit(2)
        Text(detail).font(.caption).lineLimit(1).foregroundStyle(item.urgent ? urgent : .secondary)
      }
    }
  }

  private var symbol: String {
    switch item.kind {
    case "battle": "flag.2.crossed"
    case "league": "person.2"
    case "roster": "scroll"
    default: "trophy"
    }
  }

  private var detail: String {
    guard let due = item.due else { return item.detail }
    let formatter = RelativeDateTimeFormatter()
    formatter.unitsStyle = .full
    return "\(item.detail) · \(formatter.localizedString(for: due, relativeTo: now))"
  }
}

extension View {
  /// iOS 17 draws a widget's background from its container; earlier versions take it as a plain background.
  fileprivate func widgetBackground(_ color: Color) -> some View {
    if #available(iOS 17.0, *) {
      return containerBackground(color, for: .widget)
    }
    return background(color)
  }
}

extension HomeWidgetData {
  fileprivate static let sample = HomeWidgetData(
    updatedAt: .now,
    items: [
      Item(
        kind: "battle", title: "Your game against AshenOrk", detail: "Round 2 · Shooting",
        url: "https://praetorium.gg/battles", due: nil, urgent: false),
      Item(
        kind: "league", title: "League game against Rival", detail: "Sunday League · Round 3",
        url: "https://praetorium.gg/groups", due: .now.addingTimeInterval(2 * 86400), urgent: false),
    ])
}

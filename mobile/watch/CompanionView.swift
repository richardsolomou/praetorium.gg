import SwiftUI

private let accent = Color(red: 0.61, green: 0.82, blue: 0.66)
private let panel = Color(red: 0.08, green: 0.11, blue: 0.13)
private let redSide = Color(red: 0.96, green: 0.46, blue: 0.43)
private let blueSide = Color(red: 0.47, green: 0.71, blue: 0.96)

extension EnvironmentValues {
  fileprivate var companionLuminanceReduced: Bool {
    #if DEBUG
      if ProcessInfo.processInfo.arguments.contains("--dimmed") { return true }
    #endif
    return isLuminanceReduced
  }
}

struct CompanionView: View {
  @EnvironmentObject private var store: WatchStore
  @State private var page = 0
  @AppStorage("reminderHaptics") private var reminderHaptics = false

  init() {
    #if DEBUG
      if let index = ProcessInfo.processInfo.arguments.firstIndex(of: "--page"),
        ProcessInfo.processInfo.arguments.indices.contains(index + 1),
        let selected = Int(ProcessInfo.processInfo.arguments[index + 1])
      {
        _page = State(initialValue: selected)
      }
    #endif
  }

  var body: some View {
    NavigationStack {
      if let battle = store.battle {
        TabView(selection: $page) {
          BattleGlance(battle: battle).tag(0)
          ObjectivesView(battle: battle).tag(1)
          RemindersView().tag(2)
        }
        .tabViewStyle(.verticalPage)
        .navigationTitle("Praetorium")
        .toolbar {
          ToolbarItem(placement: .topBarTrailing) {
            NavigationLink {
              Form {
                Toggle("Reminder taps", isOn: $reminderHaptics).tint(accent)
                Text(
                  "A gentle tap for new reminders while this watch app is open. Keep the live battle open on your iPhone."
                )
                .font(.footnote).foregroundStyle(.secondary)
              }.navigationTitle("Settings")
            } label: {
              Image(systemName: "gearshape").foregroundStyle(accent)
            }
            .accessibilityLabel("Settings")
          }
        }
      } else {
        VStack(spacing: 12) {
          Image(systemName: "shield.lefthalf.filled").font(.system(size: 36)).foregroundStyle(
            accent)
          Text("Ready for battle").font(.headline)
          Text(store.connectionError ?? "Open a live battle in Praetorium on your iPhone.")
            .font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center)
        }.padding().navigationTitle("Praetorium")
      }
    }
  }
}

private struct BattleGlance: View {
  @Environment(\.companionLuminanceReduced) private var isLuminanceReduced
  let battle: BattleSnapshot

  var body: some View {
    TimelineView(.periodic(from: .now, by: isLuminanceReduced ? 60 : 1)) { timeline in
      ScrollView {
        VStack(spacing: 4) {
          HStack {
            eyebrow("ROUND \(battle.round) / \(battle.rounds)")
            Spacer()
            if battle.paused { Text("Paused").font(.caption2).foregroundStyle(.secondary) }
          }
          HStack(alignment: .top, spacing: 8) {
            ForEach(battle.sides) { side in
              VStack(alignment: .leading, spacing: 2) {
                Text(side.yours ? "YOU" : "OPPONENT").font(.system(size: 10, weight: .bold))
                  .foregroundStyle(sideColor(side.index))
                Text(side.vp, format: .number.precision(.fractionLength(0)))
                  .font(.system(size: 28, weight: .bold, design: .rounded)).monospacedDigit()
                  .foregroundStyle(sideColor(side.index)).minimumScaleFactor(0.7).lineLimit(1)
                Text(side.name).font(.system(size: 11)).lineLimit(1)
                Text("\(Int(side.cp)) CP").font(
                  .system(size: 13, weight: .semibold, design: .monospaced))
              }.frame(maxWidth: .infinity, alignment: .leading)
            }
          }.padding(7).background(panel, in: RoundedRectangle(cornerRadius: 16))
          HStack(spacing: 8) {
            Capsule().fill(sideColor(battle.activeSide ?? 0)).frame(width: 3)
            VStack(alignment: .leading, spacing: 2) {
              Text(battle.phase == "end" ? "End of turn" : battle.phase.capitalized)
                .font(.system(size: 13, weight: .semibold)).lineLimit(1).minimumScaleFactor(0.8)
              Text(battle.active?.yours == true ? "Your turn" : "Opponent’s turn").font(
                .system(size: 11)
              )
              .foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
            Text(
              battle.elapsedLabel(
                at: timeline.date,
                showsSeconds: !isLuminanceReduced && timeline.cadence <= .seconds)
            )
            .font(.system(size: 17, weight: .semibold, design: .monospaced)).monospacedDigit()
            .lineLimit(1).minimumScaleFactor(0.7)
          }.padding(.horizontal, 3)
          SyncStatus(battle: battle, now: timeline.date)
        }.padding(.horizontal, 2)
      }
    }
  }
}

private struct ObjectivesView: View {
  let battle: BattleSnapshot

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 7) {
        eyebrow("YOUR OBJECTIVES")
        if battle.objectives.isEmpty {
          Text("No active objectives.").font(.footnote).foregroundStyle(.secondary)
        }
        ForEach(battle.objectives) { objective in
          NavigationLink {
            ScrollView {
              VStack(alignment: .leading, spacing: 10) {
                eyebrow(objective.kind.uppercased())
                Text(objective.name).font(.headline)
                Text("\(Int(objective.points)) VP scored").font(.footnote).foregroundStyle(accent)
                Text(objective.summary).font(.footnote)
                Text("Check the full card on your iPhone before scoring.").font(.caption2)
                  .foregroundStyle(.secondary)
              }.padding(.horizontal, 3)
            }.navigationTitle("Objective")
          } label: {
            VStack(alignment: .leading, spacing: 4) {
              HStack {
                Text(objective.kind.uppercased()).font(.system(size: 9, weight: .bold))
                  .foregroundStyle(accent)
                Spacer()
                Text("\(Int(objective.points)) VP").font(.caption2).foregroundStyle(.secondary)
              }
              Text(objective.name).font(.system(size: 15, weight: .semibold)).fixedSize(
                horizontal: false, vertical: true)
            }.frame(maxWidth: .infinity, alignment: .leading).padding(10)
              .background(panel, in: RoundedRectangle(cornerRadius: 14))
          }.buttonStyle(.plain)
        }
        TimelineView(.periodic(from: .now, by: 5)) { timeline in
          SyncStatus(battle: battle, now: timeline.date)
        }
      }.padding(.horizontal, 2)
    }
  }
}

private struct RemindersView: View {
  @EnvironmentObject private var store: WatchStore

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 8) {
        eyebrow("REMINDERS · \(store.reminders.count + (store.battle?.moreReminders ?? 0))")
        if store.reminders.isEmpty {
          VStack(spacing: 8) {
            Image(systemName: "checkmark.circle").font(.largeTitle).foregroundStyle(accent)
            Text((store.battle?.moreReminders ?? 0) > 0 ? "Check your iPhone" : "All caught up")
              .font(.headline)
            Text(
              (store.battle?.moreReminders ?? 0) > 0
                ? "More reminders are available on your iPhone."
                : "Your next reminders appear here as the battle moves on."
            ).font(.footnote)
              .foregroundStyle(.secondary).multilineTextAlignment(.center)
          }.frame(maxWidth: .infinity).padding(.vertical, 12)
        }
        ForEach(store.reminders) { reminder in
          NavigationLink {
            ScrollView {
              VStack(alignment: .leading, spacing: 10) {
                Text(reminder.moment).font(.caption2).foregroundStyle(accent)
                Text(reminder.title).font(.headline)
                if let unit = reminder.unit {
                  Text(unit).font(.footnote).foregroundStyle(.secondary)
                }
                Text(reminder.description).font(.footnote)
                Button("Dismiss on watch") { store.dismiss(reminder) }.tint(accent)
                Text("The iPhone reminder stays available. Read its full text there.").font(
                  .caption2
                ).foregroundStyle(.secondary)
              }.padding(.horizontal, 3)
            }.navigationTitle("Reminder")
          } label: {
            VStack(alignment: .leading, spacing: 4) {
              Text(reminder.moment).font(.system(size: 10, weight: .medium)).foregroundStyle(accent)
              Text(reminder.title).font(.system(size: 15, weight: .semibold))
              if let unit = reminder.unit { Text(unit).font(.caption2).foregroundStyle(.secondary) }
            }.frame(maxWidth: .infinity, alignment: .leading).padding(10)
              .background(panel, in: RoundedRectangle(cornerRadius: 14))
          }.buttonStyle(.plain)
        }
        if let battle = store.battle {
          if battle.moreReminders > 0 {
            Text("\(battle.moreReminders) more on your iPhone").font(.caption2).foregroundStyle(
              .secondary)
          }
          TimelineView(.periodic(from: .now, by: 5)) { timeline in
            SyncStatus(battle: battle, now: timeline.date)
          }
        }
      }.padding(.horizontal, 2)
    }
  }
}

private struct SyncStatus: View {
  @Environment(\.companionLuminanceReduced) private var isLuminanceReduced
  let battle: BattleSnapshot
  let now: Date

  var body: some View {
    Text(
      isLuminanceReduced
        ? (battle.isFresh(at: now) ? "Updated" : "Saved")
        : battle.isFresh(at: now)
          ? "Updated \(ageLabel(battle.age(at: now)))"
          : "Saved · \(ageLabel(battle.age(at: now)))"
    )
    .font(.system(size: 10)).foregroundStyle(battle.isFresh(at: now) ? Color.secondary : .orange)
    .multilineTextAlignment(.center).frame(maxWidth: .infinity)
    .accessibilityLabel("Last synced \(Int(battle.age(at: now))) seconds ago")
  }
}

private func eyebrow(_ text: String) -> some View {
  Text(text).font(.system(size: 10, weight: .bold, design: .monospaced)).foregroundStyle(accent)
}
private func sideColor(_ index: Int) -> Color { index == 0 ? redSide : blueSide }
private func ageLabel(_ seconds: Double) -> String {
  if seconds < 60 { return "\(Int(seconds))s ago" }
  if seconds < 3600 { return "\(Int(seconds / 60))m ago" }
  return "\(Int(seconds / 3600))h ago"
}

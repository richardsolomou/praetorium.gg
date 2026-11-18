import ActivityKit
import SwiftUI
import WidgetKit

private let panel = Color(red: 0.05, green: 0.07, blue: 0.09)
private let redSide = Color(red: 0.96, green: 0.46, blue: 0.43)
private let blueSide = Color(red: 0.47, green: 0.71, blue: 0.96)

private func sideColor(_ index: Int) -> Color { index == 0 ? redSide : blueSide }

struct BattleActivityWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: BattleActivityAttributes.self) { context in
      LockScreenBattle(state: context.state)
        .padding(16)
        .activityBackgroundTint(panel)
        .activitySystemActionForegroundColor(.white)
        .widgetURL(URL(string: context.attributes.url))
    } dynamicIsland: { context in
      let state = context.state
      return DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          if let side = state.sides.first {
            SideScore(side: side, state: state).padding(.leading, 4)
          }
        }
        DynamicIslandExpandedRegion(.trailing) {
          if state.sides.count > 1 {
            SideScore(side: state.sides[1], state: state).padding(.trailing, 4)
          }
        }
        DynamicIslandExpandedRegion(.center) {
          Text(state.roundLabel).font(.caption.weight(.bold)).foregroundStyle(.secondary)
        }
        DynamicIslandExpandedRegion(.bottom) {
          TurnLine(state: state)
        }
      } compactLeading: {
        Text("R\(state.round)").font(.caption.weight(.bold)).foregroundStyle(state.activeColor)
      } compactTrailing: {
        Text(state.scoreLine).font(.caption.weight(.semibold)).monospacedDigit()
      } minimal: {
        Text("R\(state.round)").font(.caption2.weight(.bold)).foregroundStyle(state.activeColor)
      }
      .widgetURL(URL(string: context.attributes.url))
      .keylineTint(state.activeColor)
    }
  }
}

private struct LockScreenBattle: View {
  let state: BattleActivityAttributes.ContentState

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text(state.roundLabel).font(.caption.weight(.bold)).foregroundStyle(.secondary)
      HStack(alignment: .top, spacing: 12) {
        ForEach(state.sides, id: \.index) { side in
          SideScore(side: side, state: state).frame(maxWidth: .infinity, alignment: .leading)
        }
      }
      TurnLine(state: state)
    }
    .foregroundStyle(.white)
  }
}

private struct SideScore: View {
  let side: BattleActivityAttributes.Side
  let state: BattleActivityAttributes.ContentState

  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(side.yours ? "YOU" : "OPPONENT").font(.system(size: 11, weight: .bold))
        .foregroundStyle(sideColor(side.index))
      HStack(alignment: .firstTextBaseline, spacing: 6) {
        Text("\(side.vp)").font(.system(size: 30, weight: .bold, design: .rounded))
          .monospacedDigit()
          .foregroundStyle(sideColor(side.index))
        Text("VP").font(.caption2.weight(.semibold)).foregroundStyle(.secondary)
        Text("\(side.cp) CP").font(.system(size: 14, weight: .semibold, design: .monospaced))
      }
      .lineLimit(1).minimumScaleFactor(0.7)
      Text(side.name).font(.caption).lineLimit(1).foregroundStyle(.secondary)
    }
  }
}

private struct TurnLine: View {
  let state: BattleActivityAttributes.ContentState

  var body: some View {
    HStack(spacing: 8) {
      Capsule().fill(state.activeColor).frame(width: 3, height: 28)
      VStack(alignment: .leading, spacing: 1) {
        Text(state.phaseLabel).font(.subheadline.weight(.semibold)).lineLimit(1)
        (Text("Updated ") + Text(state.updatedAt, style: .relative) + Text(" ago"))
          .font(.caption2).foregroundStyle(.secondary).lineLimit(1)
      }
      Spacer(minLength: 0)
      if let started = state.turnStartedAt, !state.finished {
        Text(timerInterval: started...Date.distantFuture, countsDown: false)
          .font(.system(size: 17, weight: .semibold, design: .monospaced)).monospacedDigit()
          .multilineTextAlignment(.trailing).frame(maxWidth: 110, alignment: .trailing)
      } else if !state.finished && state.activeSide != nil {
        Text(state.stoppedClock).font(.system(size: 17, weight: .semibold, design: .monospaced))
          .monospacedDigit().foregroundStyle(.secondary)
      }
    }
  }
}

extension BattleActivityAttributes.ContentState {
  var roundLabel: String { finished ? "FINAL SCORE" : "ROUND \(round) / \(rounds)" }

  var phaseLabel: String {
    if finished { return "Battle over" }
    let phase = phase == "end" ? "End of turn" : "\(phase.capitalized) phase"
    guard let active = sides.first(where: { $0.index == activeSide }) else { return phase }
    let turn = active.yours ? "Your turn" : "Opponent's turn"
    return paused ? "Paused · \(turn)" : "\(phase) · \(turn)"
  }

  var activeColor: Color { activeSide.map(sideColor) ?? .white }

  /// The viewer's score first, the way they read their own game.
  var scoreLine: String {
    let ordered = sides.sorted { $0.yours && !$1.yours }
    return ordered.map { "\($0.vp)" }.joined(separator: "–")
  }

  var stoppedClock: String {
    let total = Int(turnElapsedMs / 1000)
    return total >= 3600
      ? String(format: "%d:%02d:%02d", total / 3600, total / 60 % 60, total % 60)
      : String(format: "%02d:%02d", total / 60, total % 60)
  }
}

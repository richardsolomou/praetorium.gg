import type { WatchBattle } from '../../../contracts/watchBattle'
import type { BattleView } from '../../../core/battleView'
import { clockMs, runsIn, type BattleClock } from '../../../core/battleClock'
import type { RosterReminder } from '../../../core/reminders'
import { appliesInMode, conditionLabel, payoutJoin, roundLabel, timingLabel } from '../../missionText'
import { sides, sideName, type SideMission } from '../../sides'
import type { ReferenceCard } from './MissionCards'
import type { ReminderDismissalContext } from './reminderDismissals'

export type WatchReminderPrompt = { reminders: RosterReminder[]; moment: string; context: ReminderDismissalContext }
const clip = (text: string, length: number) => {
  const encoder = new TextEncoder()
  if (encoder.encode(JSON.stringify(text)).length <= length + 2) return text
  let clipped = ''
  let size = 0
  for (const character of text) {
    const cost = encoder.encode(JSON.stringify(character)).length - 2
    if (size + cost > length - 3) break
    clipped += character
    size += cost
  }
  return `${clipped}…`
}

export function watchBattle(
  view: BattleView,
  clock: BattleClock,
  missions: { side: number; mission: SideMission | null }[],
  referenceFor: (key: string) => ReferenceCard | undefined,
  prompts: WatchReminderPrompt[],
  updatedAt: number,
): WatchBattle | null {
  if (view.status !== 'playing' || !view.players.some((player) => player.isViewer)) return null
  const table = sides(view, missions)
  const yours = table.find((side) => side.isViewer)
  if (!yours) return null
  const active = table.find((side) => side.isActive)
  const cards = [
    ...(yours.primaryCard ? [{ ...yours.primaryCard, kind: 'Primary' as const, points: yours.primary }] : []),
    ...yours.secondaries
      .filter((card) => card.status === 'active')
      .map((card) => ({ ...card, kind: card.secret ? ('Secret' as const) : ('Secondary' as const) })),
  ]
  const reminders = prompts.flatMap((prompt) =>
    prompt.reminders.map((reminder) => ({
      id: clip(JSON.stringify([prompt.context.round, prompt.context.activePlayerId, prompt.context.phase, reminder.key]), 500),
      title: clip(reminder.ability, 80),
      unit: reminder.unit ? clip(reminder.unit.name, 80) : null,
      moment: clip(prompt.moment, 120),
      description: clip(reminder.description, 500),
    })),
  )
  const uniqueReminders = [...new Map(reminders.map((reminder) => [reminder.id, reminder])).values()]
  return {
    version: 1,
    battleId: clip(view.token, 160),
    viewerId: clip(view.viewerId, 160),
    seq: view.seq,
    updatedAt,
    round: view.round,
    rounds: view.rounds,
    phase: view.phase,
    activeSide: active?.index ?? null,
    paused: clock.paused,
    turnElapsedMs: active ? clockMs(clock, updatedAt, { side: active.index, round: view.round }) : 0,
    turnRunning: Boolean(active && runsIn(clock, { side: active.index, round: view.round })),
    sides: table.map((side) => ({ index: side.index, name: clip(sideName(side), 160), yours: side.isViewer, vp: side.total, cp: side.cp })),
    objectives: cards.slice(0, 10).map((card) => {
      const reference = referenceFor(card.key)
      const awards = (reference?.awards ?? card.awards ?? []).filter((award) =>
        appliesInMode(award, card.kind === 'Primary' ? undefined : yours.secondaryMode),
      )
      const summary = awards
        .map(
          (award, index) =>
            `${[payoutJoin(award, awards[index - 1]), timingLabel(award.trigger), roundLabel(award.trigger)].filter(Boolean).join(' · ')}: ${award.vp} VP${award.per ? ` per ${award.per}` : ''}${award.max !== null ? ` (max ${award.max})` : ''}. ${conditionLabel(award) ?? 'Check the full card on your iPhone.'}`,
        )
        .join('\n\n')
      return {
        id: clip(card.key, 160),
        name: clip(card.name, 160),
        kind: card.kind,
        points: card.points,
        summary: clip(summary || 'Check the full card on your iPhone.', 1400),
      }
    }),
    reminders: uniqueReminders.slice(0, 20),
    moreReminders: Math.max(0, uniqueReminders.length - 20),
  }
}

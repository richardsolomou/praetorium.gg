import { watchLive, type WatchBattle } from '../../../contracts/watchBattle'
import { loadedWords } from '../../sourceText'
import type { BattleView } from '../../../core/battleView'
import type { BattleClock } from '../../../core/battleClock'
import type { RosterReminder } from '../../../core/reminders'
import { jsonByteLength } from '../../../core/json'
import { appliesInMode, conditionLabel, payoutJoin, roundLabel, timingLabel } from '../../missionText'
import { sides, sideName, type SideMission } from '../../sides'
import type { ReferenceCard } from './MissionCards'
import type { ReminderDismissalContext } from './reminderDismissals'

export type WatchReminderPrompt = { reminders: RosterReminder[]; moment: string; context: ReminderDismissalContext }
const clip = (text: string, length: number) => {
  if (jsonByteLength(text) <= length + 2) return text
  let clipped = ''
  let size = 0
  for (const character of text) {
    const cost = jsonByteLength(character) - 2
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
  liveUrl: string,
): WatchBattle | null {
  if (view.status === 'setup') return null
  const table = sides(view, missions)
  // A spectator follows the score with every side shown as someone else's and nothing private to carry.
  const yours = table.find((side) => side.isViewer)
  const cards = yours
    ? [
        ...(yours.primaryCard ? [{ ...yours.primaryCard, kind: 'Primary' as const, points: yours.primary }] : []),
        ...yours.secondaries
          .filter((card) => card.status === 'active')
          .map((card) => ({ ...card, kind: card.secret ? ('Secret' as const) : ('Secondary' as const) })),
      ]
    : []
  const reminders = (yours ? prompts : []).flatMap((prompt) =>
    prompt.reminders.map((reminder) => ({
      id: clip(JSON.stringify([prompt.context.round, prompt.context.activePlayerId, prompt.context.phase, reminder.key]), 500),
      title: clip(reminder.ability, 80),
      unit: reminder.unit ? clip(reminder.unit.name, 80) : null,
      moment: clip(prompt.moment, 120),
      // A watch cannot load rules text, so it gets the words this device has loaded or none, never a token cut short.
      description: clip(loadedWords(reminder.description) ?? '', 500),
    })),
  )
  const uniqueReminders = [...new Map(reminders.map((reminder) => [reminder.id, reminder])).values()]
  const live = watchLive(view, clock, updatedAt)
  return {
    version: 1,
    battleId: clip(view.token, 160),
    viewerId: clip(view.viewerId, 160),
    liveUrl,
    ...live,
    sides: live.sides.map((side) => {
      const named = table.find((entry) => entry.index === side.index)
      return { ...side, name: clip(named ? sideName(named) : '', 160), yours: Boolean(named?.isViewer) }
    }),
    objectives: cards.slice(0, 10).map((card) => {
      const reference = referenceFor(card.key)
      const awards = (reference?.awards ?? card.awards ?? []).filter((award) =>
        appliesInMode(award, card.kind === 'Primary' ? undefined : yours?.secondaryMode),
      )
      const summary = awards
        .map(
          (award, index) =>
            `${[payoutJoin(award, awards[index - 1]), timingLabel(award.trigger), roundLabel(award.trigger)].filter(Boolean).join(' · ')}: ${award.vp} VP${award.per ? ` per ${award.per}` : ''}${award.max !== null ? ` (max ${award.max})` : ''}. ${loadedWords(conditionLabel(award) ?? '') || 'Check the full card on your iPhone.'}`,
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

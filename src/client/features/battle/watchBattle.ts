import { MISSION_ACTION_REMINDER_PREFIX } from '../../missionActionReminders'
import { watchLive, type WatchBattle } from '../../../contracts/watchBattle'
import { ownWords } from '../../../core/sourceText'
import type { BattleView } from '../../../core/battleView'
import type { BattleClock } from '../../../core/battleClock'
import type { RosterReminder } from '../../../core/reminders'
import { jsonByteLength } from '../../../core/json'
import { appliesInMode, conditionLabel, momentsLabel, payoutJoin } from '../../missionText'
import { awardsOnce } from '../../../core/scoring'
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

type Missions = { side: number; mission: SideMission | null }[]
type References = (key: string) => ReferenceCard | undefined

/** The viewer's side and the objectives it holds, each with the awards its mode scores; a spectator has neither. */
function viewerObjectives(view: BattleView, missions: Missions, referenceFor: References) {
  const table = sides(view, missions)
  // A spectator follows the score with every side shown as someone else's and nothing private to carry.
  const yours = table.find((side) => side.isViewer)
  const cards = yours
    ? [
        ...(yours.primaryCard ? [{ ...yours.primaryCard, kind: 'Primary' as const, points: yours.primary }] : []),
        ...yours.secondaries.filter((card) => card.status === 'active').map((card) => ({ ...card, kind: 'Secondary' as const })),
      ]
    : []
  const objectives = cards.slice(0, 10).map((card) => ({
    card,
    awards: (referenceFor(card.key)?.awards ?? card.awards ?? []).filter((award) =>
      appliesInMode(award, card.kind === 'Primary' ? undefined : yours?.secondaryMode),
    ),
  }))
  return { table, yours, objectives }
}

/** The rules texts a watch snapshot describes: the viewer's reminders and the conditions of their objectives' awards. */
export function watchBattleTexts(view: BattleView, missions: Missions, referenceFor: References, prompts: WatchReminderPrompt[]) {
  if (view.status === 'setup') return []
  const { yours, objectives } = viewerObjectives(view, missions, referenceFor)
  return [
    ...(yours ? prompts : []).flatMap((prompt) => prompt.reminders.map((reminder) => reminder.description)),
    ...objectives.flatMap(({ awards }) => awards.flatMap((award) => conditionLabel(award) ?? [])),
  ]
}

/**
 * What a watch shows of a battle. A watch holds no rules text, so a rule's words are its own where it has them and
 * otherwise `described`, plain text the phone gives it, as a rule's summary; never a token cut short. A mission award or
 * action is described by its summary's `kind:id`.
 */
export function watchBattle(
  view: BattleView,
  clock: BattleClock,
  missions: Missions,
  referenceFor: References,
  prompts: WatchReminderPrompt[],
  updatedAt: number,
  liveUrl: string,
  described: (text: string) => string | null = () => null,
): WatchBattle | null {
  if (view.status === 'setup') return null
  const { table, yours, objectives } = viewerObjectives(view, missions, referenceFor)
  const plain = (text: string) => ownWords(text) ?? described(text)
  const reminderText = (reminder: { key: string; description: string }) =>
    reminder.key.startsWith(MISSION_ACTION_REMINDER_PREFIX)
      ? described(`mission-action:${reminder.description}`)
      : plain(reminder.description)
  const reminders = (yours ? prompts : []).flatMap((prompt) =>
    prompt.reminders.map((reminder) => ({
      id: clip(JSON.stringify([prompt.context.round, prompt.context.activePlayerId, prompt.context.phase, reminder.key]), 500),
      title: clip(reminder.ability, 80),
      unit: reminder.unit ? clip(reminder.unit.name, 80) : null,
      moment: clip(prompt.moment, 120),
      description: clip(reminderText(reminder) ?? '', 500),
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
    objectives: objectives.map(({ card, awards }) => {
      const summary = awardsOnce(awards)
        .map(({ award, triggers }, index, once) =>
          [
            `${[payoutJoin(award, once[index - 1]?.award), momentsLabel(triggers)].filter(Boolean).join(' · ')}: ${award.vp} VP${award.per ? ` per ${award.per}` : ''}${award.max !== null ? ` (max ${award.max})` : ''}.`,
            plain(conditionLabel(award) ?? '') || (award.id ? described(`mission-award:${award.id}`) : null),
          ]
            .filter(Boolean)
            .join(' '),
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

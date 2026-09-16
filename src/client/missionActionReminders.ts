import type { MissionAction } from '../contracts/missions'
import type { RosterReminder } from '../core/reminders'

type MissionCard = { key: string; name: string }
type SecondaryCard = MissionCard & { status: string }
type MissionHand = { primaryCard: MissionCard | null; secondaries: readonly SecondaryCard[] }
type MissionReference = { actions: readonly MissionAction[] }

export const MISSION_ACTION_REMINDER_PREFIX = 'mission-action:'

export const missionActionReminderStorageKey = (battleToken: string) => `praetorium.action-reminders.${battleToken}`

export const missionActionRemindersEnabled = (stored: string | null) => stored !== 'off'

export function missionActionText(action: MissionAction): string {
  const lines: [string, string | null][] = [
    ['Starts', action.starts],
    ['Completes', action.completes],
    ['Effect', action.effect],
    ['Units', action.units],
    ['Use limit', action.useLimit],
    ['Restriction', action.restriction],
  ]
  return lines.flatMap(([label, line]) => (line ? [`**${label}:** ${line}`] : [])).join('\n\n')
}

/** Mission actions due at the start of the active player's Shooting phase. */
export function missionActionReminders(side: MissionHand, referenceFor: (key: string) => MissionReference | undefined): RosterReminder[] {
  const cards = [...(side.primaryCard ? [side.primaryCard] : []), ...side.secondaries.filter((card) => card.status === 'active')]

  return cards.flatMap((card) =>
    (referenceFor(card.key)?.actions ?? []).map((action, index) => ({
      key: `${MISSION_ACTION_REMINDER_PREFIX}${card.key}:${index}`,
      ability: card.name.toLocaleLowerCase() === action.name.toLocaleLowerCase() ? card.name : `${card.name}: ${action.name}`,
      description: missionActionText(action),
      timings: [{ moment: 'phase-start', phase: 'shooting', turn: 'your-turn' }],
    })),
  )
}

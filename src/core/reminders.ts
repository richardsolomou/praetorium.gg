import { z } from 'zod'
import { routeSlug } from './slug'

export const REMINDER_MOMENTS = ['phase-start', 'phase-end', 'turn-start', 'turn-end'] as const
export const REMINDER_TURNS = ['your-turn', 'opponent-turn', 'either'] as const
export const REMINDER_PHASES = ['command', 'movement', 'shooting', 'charge', 'fight'] as const
export const ROSTER_REMINDERS_MAX = 100
export const REMINDER_TIMINGS_MAX = 10
export const REMINDER_ABILITY_MAX_LENGTH = 80
export const REMINDER_DESCRIPTION_MAX_LENGTH = 10_000

export type ReminderMoment = (typeof REMINDER_MOMENTS)[number]
export type ReminderTurn = (typeof REMINDER_TURNS)[number]
export type ReminderPhase = (typeof REMINDER_PHASES)[number]

export const reminderTimingSchema = z.discriminatedUnion('moment', [
  z.object({
    moment: z.enum([REMINDER_MOMENTS[0], REMINDER_MOMENTS[1]]),
    phase: z.enum(REMINDER_PHASES),
    turn: z.enum(REMINDER_TURNS),
  }),
  z.object({
    moment: z.enum([REMINDER_MOMENTS[2], REMINDER_MOMENTS[3]]),
    phase: z.null(),
    turn: z.enum(REMINDER_TURNS),
  }),
])
export type ReminderTiming = z.infer<typeof reminderTimingSchema>

export const rosterReminderSchema = z.object({
  key: z.string().min(1).max(240),
  ability: z.string().min(1).max(REMINDER_ABILITY_MAX_LENGTH),
  description: z.string().max(REMINDER_DESCRIPTION_MAX_LENGTH),
  unit: z.object({ index: z.number().int().min(0).max(99), name: z.string().min(1).max(REMINDER_ABILITY_MAX_LENGTH) }).optional(),
  timings: z.array(reminderTimingSchema).min(1).max(REMINDER_TIMINGS_MAX),
})
export type RosterReminder = z.infer<typeof rosterReminderSchema>

type ReminderAbility = { id?: string; kind: string; name: string }

export function reminderKey(ability: ReminderAbility, unitIndex: number | null): string {
  const owner = ability.kind === 'faction' ? 'army' : (unitIndex ?? 'reference')
  const abilityKey = ability.kind === 'faction' ? routeSlug(ability.name) : (ability.id ?? routeSlug(ability.name))
  return `${ability.kind}:${abilityKey}:${owner}`
}

type Candidate = { index: number; timing: ReminderTiming }

const phaseAt = (value: string): ReminderPhase | null => REMINDER_PHASES.find((phase) => phase === value.toLocaleLowerCase()) ?? null

const turnAt = (value: string | undefined): ReminderTurn => {
  const owner = value?.toLocaleLowerCase().replaceAll('’', "'").trim() ?? ''
  if (owner.includes('opponent')) return 'opponent-turn'
  if (owner.startsWith('your')) return 'your-turn'
  return 'either'
}

/** Suggest action timings while excluding duration and expiry clauses such as "until the start". */
export function suggestReminderTimings(description: string): ReminderTiming[] {
  const text = description.replaceAll(/\s+/gu, ' ')
  const candidates: Candidate[] = []
  const phasePattern =
    /\bat (?:the )?(start|end) of (your opponent[’']s|the opponent[’']s|each player[’']s|either player[’']s|your|any|the)?\s*(command|movement|shooting|charge|fight) phase\b/giu
  const turnPattern =
    /\bat (?:the )?(start|end) of (your opponent[’']s|the opponent[’']s|each player[’']s|either player[’']s|your|any|the)?\s*turn\b/giu
  const broadPhasePattern =
    /\b(?:in|during) (your opponent[’']s|the opponent[’']s|each player[’']s|either player[’']s|your|any|the)?\s*(?:first |next )?(command|movement|shooting|charge|fight) phase\b/giu
  const additionalPhasePattern =
    /\b(?:or|and) (your opponent[’']s|the opponent[’']s|each player[’']s|either player[’']s|your|any|the)?\s*(command|movement|shooting|charge|fight) phase\b/giu

  for (const match of text.matchAll(phasePattern)) {
    const phase = phaseAt(match[3] ?? '')
    if (phase)
      candidates.push({
        index: match.index,
        timing: { moment: match[1]?.toLocaleLowerCase() === 'end' ? 'phase-end' : 'phase-start', phase, turn: turnAt(match[2]) },
      })
  }
  for (const match of text.matchAll(turnPattern)) {
    candidates.push({
      index: match.index,
      timing: {
        moment: match[1]?.toLocaleLowerCase() === 'end' ? 'turn-end' : 'turn-start',
        phase: null,
        turn: turnAt(match[2]),
      },
    })
  }
  for (const match of text.matchAll(broadPhasePattern)) {
    const phase = phaseAt(match[2] ?? '')
    if (phase) candidates.push({ index: match.index, timing: { moment: 'phase-start', phase, turn: turnAt(match[1]) } })
  }
  for (const match of text.matchAll(additionalPhasePattern)) {
    const phase = phaseAt(match[2] ?? '')
    if (phase) candidates.push({ index: match.index, timing: { moment: 'phase-start', phase, turn: turnAt(match[1]) } })
  }
  const unique = new Map<string, ReminderTiming>()
  for (const candidate of candidates.toSorted((left, right) => left.index - right.index)) {
    unique.set(JSON.stringify(candidate.timing), candidate.timing)
  }
  return [...unique.values()]
}

export function reminderDue(timing: ReminderTiming, moment: ReminderTiming): boolean {
  if (timing.moment !== moment.moment || timing.phase !== moment.phase) return false
  return timing.turn === 'either' || timing.turn === moment.turn
}

export function remindersDueAt(reminders: readonly RosterReminder[], moments: readonly ReminderTiming[]): RosterReminder[] {
  return reminders.filter((reminder) => reminder.timings.some((timing) => moments.some((moment) => reminderDue(timing, moment))))
}

export function reminderTimingLabel(timing: ReminderTiming): string {
  const owner = timing.turn === 'your-turn' ? 'your' : timing.turn === 'opponent-turn' ? "opponent's" : 'either'
  if (timing.phase === null) {
    return `${timing.moment === 'turn-start' ? 'Start' : 'End'} of ${owner} turn`
  }
  const phase = `${timing.phase[0]?.toLocaleUpperCase()}${timing.phase.slice(1)}`
  return `${timing.moment === 'phase-start' ? 'Start' : 'End'} of ${owner} ${phase} phase`
}

export function remindersAfterUnitRemoved(reminders: readonly RosterReminder[], removedIndex: number): RosterReminder[] {
  return reminders.flatMap((reminder) => {
    if (!reminder.unit) return [reminder]
    if (reminder.unit.index === removedIndex) return []
    return [reminder.unit.index > removedIndex ? { ...reminder, unit: { ...reminder.unit, index: reminder.unit.index - 1 } } : reminder]
  })
}

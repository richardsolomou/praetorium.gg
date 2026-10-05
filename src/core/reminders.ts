import { z } from 'zod'
import { routeSlug } from './slug'

export const REMINDER_MOMENTS = ['phase-start', 'phase-end', 'turn-start', 'turn-end', 'round-start', 'round-end'] as const
export const REMINDER_TURNS = ['your-turn', 'opponent-turn', 'either'] as const
export const REMINDER_PHASES = ['command', 'movement', 'shooting', 'charge', 'fight'] as const
export const ROSTER_REMINDERS_MAX = 100
export const REMINDER_TIMINGS_MAX = 10
export const REMINDER_ABILITY_MAX_LENGTH = 80
export const REMINDER_DESCRIPTION_MAX_LENGTH = 10_000

export type ReminderMoment = (typeof REMINDER_MOMENTS)[number]
export type ReminderTurn = (typeof REMINDER_TURNS)[number]
export type ReminderPhase = (typeof REMINDER_PHASES)[number] | 'any'

export const reminderTimingSchema = z
  .discriminatedUnion('moment', [
    z.object({
      moment: z.enum([REMINDER_MOMENTS[0], REMINDER_MOMENTS[1]]),
      phase: z.enum([...REMINDER_PHASES, 'any']),
      turn: z.enum(REMINDER_TURNS),
    }),
    z.object({
      moment: z.enum([REMINDER_MOMENTS[2], REMINDER_MOMENTS[3]]),
      phase: z.null(),
      turn: z.enum(REMINDER_TURNS),
    }),
    z.object({
      moment: z.enum([REMINDER_MOMENTS[4], REMINDER_MOMENTS[5]]),
      phase: z.null(),
      turn: z.literal('either'),
    }),
  ])
  .and(z.object({ firstRoundOnly: z.boolean().optional() }))
export type ReminderTiming = z.infer<typeof reminderTimingSchema>

export const rosterReminderSchema = z.object({
  key: z.string().min(1).max(240),
  ability: z.string().min(1).max(REMINDER_ABILITY_MAX_LENGTH),
  description: z.string().max(REMINDER_DESCRIPTION_MAX_LENGTH),
  unit: z.object({ index: z.number().int().min(0).max(99), name: z.string().min(1).max(REMINDER_ABILITY_MAX_LENGTH) }).optional(),
  whileDestroyed: z.boolean().optional(),
  timings: z.array(reminderTimingSchema).min(1).max(REMINDER_TIMINGS_MAX),
})
export type RosterReminder = z.infer<typeof rosterReminderSchema>

export type ReminderSubject = { id?: string; kind: string; name: string; description?: string | null }

export function reminderKey(ability: ReminderSubject, unitIndex: number | null): string {
  const owner = ability.kind === 'faction' ? 'army' : (unitIndex ?? 'reference')
  const abilityKey = ability.kind === 'faction' ? routeSlug(ability.name) : (ability.id ?? routeSlug(ability.name))
  return `${ability.kind}:${abilityKey}:${owner}`
}

export function suggestReminderWhileDestroyed(description: string): boolean {
  return /\b(?:if|when|each time) (?:this model|this unit|the bearer) is destroyed\b/iu.test(description.replaceAll(/\s+/gu, ' '))
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
  const roundPattern = /\bat (?:the )?(start|end) of (?:the |each |every |a )?(first )?battle round\b/giu
  const genericPhasePattern = /\bat (?:the )?(start|end) of (?:any|each|a|the) phase\b/giu
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
  for (const match of text.matchAll(roundPattern)) {
    if (/\bdid not select $/iu.test(text.slice(0, match.index))) continue
    candidates.push({
      index: match.index,
      timing: {
        moment: match[1]?.toLocaleLowerCase() === 'end' ? 'round-end' : 'round-start',
        phase: null,
        turn: 'either',
        ...(match[2] ? { firstRoundOnly: true } : {}),
      },
    })
  }
  for (const match of text.matchAll(genericPhasePattern)) {
    candidates.push({
      index: match.index,
      timing: { moment: match[1]?.toLocaleLowerCase() === 'end' ? 'phase-end' : 'phase-start', phase: 'any', turn: 'either' },
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

export function reminderDue(timing: ReminderTiming, moment: ReminderTiming, round?: number): boolean {
  if (timing.firstRoundOnly && round !== 1) return false
  if (timing.moment !== moment.moment || (timing.phase !== 'any' && timing.phase !== moment.phase)) return false
  return timing.turn === 'either' || timing.turn === moment.turn
}

export function remindersDueAt(reminders: readonly RosterReminder[], moments: readonly ReminderTiming[], round?: number): RosterReminder[] {
  return reminders.filter((reminder) => reminder.timings.some((timing) => moments.some((moment) => reminderDue(timing, moment, round))))
}

export function reminderTimingCountsByUnit(reminders: readonly RosterReminder[]): Map<number, number> {
  const counts = new Map<number, number>()
  for (const reminder of reminders) {
    if (reminder.unit) counts.set(reminder.unit.index, (counts.get(reminder.unit.index) ?? 0) + reminder.timings.length)
  }
  return counts
}

export function reminderTimingLabel(timing: ReminderTiming): string {
  const label = reminderTimingLabelWithoutRestriction(timing)
  return timing.firstRoundOnly ? `${label} · First round only` : label
}

function reminderTimingLabelWithoutRestriction(timing: ReminderTiming): string {
  if (timing.moment === 'round-start' || timing.moment === 'round-end') {
    return `${timing.moment === 'round-start' ? 'Start' : 'End'} of round`
  }
  const owner = timing.turn === 'your-turn' ? 'your' : timing.turn === 'opponent-turn' ? "opponent's" : 'either'
  if (timing.phase === null) {
    return `${timing.moment === 'turn-start' ? 'Start' : 'End'} of ${owner} turn`
  }
  if (timing.phase === 'any') {
    const boundary = timing.moment === 'phase-start' ? 'Start' : 'End'
    return `${boundary} of any phase${timing.turn === 'either' ? '' : ` on ${owner} turn`}`
  }
  const phase = `${timing.phase[0]?.toLocaleUpperCase()}${timing.phase.slice(1)}`
  return `${timing.moment === 'phase-start' ? 'Start' : 'End'} of ${owner} ${phase} phase`
}

export function remindersAfterUnitRemoved(reminders: readonly RosterReminder[], removedIndex: number): RosterReminder[] {
  return reminders.flatMap((reminder) => {
    if (!reminder.unit) return [reminder]
    if (reminder.unit.index === removedIndex) return []
    return [reminder.unit.index > removedIndex ? reminderAtUnitIndex(reminder, reminder.unit.index - 1) : reminder]
  })
}

export function remindersAfterUnitInserted(reminders: readonly RosterReminder[], insertedIndex: number): RosterReminder[] {
  return reminders.map((reminder) =>
    reminder.unit && reminder.unit.index >= insertedIndex ? reminderAtUnitIndex(reminder, reminder.unit.index + 1) : reminder,
  )
}

function reminderAtUnitIndex(reminder: RosterReminder, index: number): RosterReminder {
  if (!reminder.unit) return reminder
  const separator = reminder.key.lastIndexOf(':')
  const key = separator < 0 ? reminder.key : `${reminder.key.slice(0, separator + 1)}${index}`
  return { ...reminder, key, unit: { ...reminder.unit, index } }
}

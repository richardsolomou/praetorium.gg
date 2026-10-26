import { capitalised, plainQuotes } from './text'
import { z } from 'zod'
import { type Phase, type Stratagem, TURN_SCOPES, type TurnScope } from './battle'
import { routeSlug } from './slug'

const REMINDER_MOMENTS = ['phase-start', 'phase-end', 'turn-start', 'turn-end', 'round-start', 'round-end'] as const
export const REMINDER_PHASES = ['command', 'movement', 'shooting', 'charge', 'fight'] as const
export const ROSTER_REMINDERS_MAX = 200
export const ABILITY_REMINDERS_MAX = 200
export const REMINDER_TIMINGS_MAX = 10
const REMINDER_ABILITY_MAX_LENGTH = 80
const REMINDER_DESCRIPTION_MAX_LENGTH = 10_000

export type ReminderMoment = (typeof REMINDER_MOMENTS)[number]
export type ReminderPhase = (typeof REMINDER_PHASES)[number] | 'any'

export const reminderTimingSchema = z
  .discriminatedUnion('moment', [
    z.object({
      moment: z.enum([REMINDER_MOMENTS[0], REMINDER_MOMENTS[1]]),
      phase: z.enum([...REMINDER_PHASES, 'any']),
      turn: z.enum(TURN_SCOPES),
    }),
    z.object({
      moment: z.enum([REMINDER_MOMENTS[2], REMINDER_MOMENTS[3]]),
      phase: z.null(),
      turn: z.enum(TURN_SCOPES),
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

/** A player's alert for an ability, wherever they field a unit with it; a battle freezes it per unit through `fieldedReminders`. */
export const abilityReminderSchema = rosterReminderSchema.omit({ unit: true })
export type AbilityReminder = z.infer<typeof abilityReminderSchema>

export type ReminderSubject = { id?: string; kind: string; name: string; description?: string | null }

/** Army and detachment rules apply to the whole army, so one alert covers every unit that shows them. */
export function armyReminder(ability: ReminderSubject): boolean {
  return ability.kind === 'faction' || ability.kind === 'detachment'
}

/**
 * An ability's identity across units and rosters. Core and faction rules go by name: each datasheet links them under
 * its own id.
 */
export function reminderKey(ability: ReminderSubject): string {
  const abilityKey =
    ability.kind === 'faction' || ability.kind === 'core' ? routeSlug(ability.name) : (ability.id ?? routeSlug(ability.name))
  return `${ability.kind}:${abilityKey}`
}

const reminderKind = (key: string) => key.slice(0, key.indexOf(':'))

/** Whether an alert names an army rule, which alerts once for the whole army rather than for each unit. */
export const armyReminderKey = (key: string) => armyReminder({ kind: reminderKind(key), name: '' })

type ChosenOption = { kind?: 'enhancement' | 'upgrade'; chosen: string }

/**
 * The alerts a battle fields from a player's settings: one per unit holding each unit ability, one per army rule the
 * roster fields. `shown` lists, by unit key, the abilities each unit's datasheet shows.
 */
export function fieldedReminders(
  settings: readonly AbilityReminder[],
  roster: { detachmentIds: readonly string[]; units: readonly { key: number; name: string; choices: readonly ChosenOption[] }[] },
  shown: readonly (readonly [number, readonly string[]])[],
): RosterReminder[] {
  const sheets = new Map(shown)
  const units = roster.units.map((unit) => ({
    ...unit,
    abilities: [...(sheets.get(unit.key) ?? []), ...chosenReminderAbilities(unit.choices)],
  }))
  return remindersForDetachments(settings, roster.detachmentIds)
    .flatMap((setting) => {
      const holders = units.filter((unit) => unit.abilities.includes(setting.key))
      const kind = reminderKind(setting.key)
      if (kind === 'detachment' || (kind === 'faction' && holders.length)) return [{ ...setting, key: `${setting.key}:army` }]
      if (kind === 'faction') return []
      return holders.map((unit) => ({ ...setting, key: `${setting.key}:${unit.key}`, unit: { index: unit.key, name: unit.name } }))
    })
    .slice(0, ROSTER_REMINDERS_MAX)
}

export const ABILITY_REMINDERS_FULL = `You can keep up to ${ABILITY_REMINDERS_MAX} ability alerts. Remove one first.`

/** Whether a player may set this alert: changing one they hold never counts against the limit. */
export const abilityReminderFits = (settings: readonly { key: string }[], key: string) =>
  settings.length < ABILITY_REMINDERS_MAX || settings.some((setting) => setting.key === key)

/** A player's alerts with one set for its ability, in the order the account lists them. */
export const withAbilityReminder = (settings: readonly AbilityReminder[], reminder: AbilityReminder) =>
  [...settings.filter((setting) => setting.key !== reminder.key), reminder].toSorted((left, right) => left.key.localeCompare(right.key))

/** The enhancement and upgrade alerts a unit's chosen options carry, keyed as their loadout offers them. */
export const chosenReminderAbilities = (choices: readonly ChosenOption[]) =>
  choices.flatMap((choice) => (choice.kind && choice.chosen ? [`${choice.kind}:${choice.chosen}`] : []))

/** The ability a per-unit alert kept by an older build's roster is for, keyed as an account keeps it. */
export function legacyAbilityKey(reminder: Pick<RosterReminder, 'key' | 'ability'>) {
  const kind = reminderKind(reminder.key)
  return kind === 'faction' || kind === 'core'
    ? `${kind}:${routeSlug(reminder.ability)}`
    : reminder.key.slice(0, reminder.key.lastIndexOf(':'))
}

/**
 * Account settings from alerts rosters kept per unit: one per ability, timed as the most recently saved roster timed it.
 */
export function abilityRemindersFromRosters(
  rosters: readonly { updatedAt: number; reminders: readonly RosterReminder[] }[],
): AbilityReminder[] {
  const settings = new Map<string, AbilityReminder>()
  for (const roster of rosters.toSorted((left, right) => right.updatedAt - left.updatedAt)) {
    for (const { unit: _unit, ...reminder } of roster.reminders) {
      const key = legacyAbilityKey(reminder)
      if (!settings.has(key)) settings.set(key, { ...reminder, key })
    }
  }
  return [...settings.values()].slice(0, ABILITY_REMINDERS_MAX)
}

export function detachmentRuleSubject(
  detachmentId: string,
  rule: { name: string; description: string | null },
): ReminderSubject & { kind: 'detachment' } {
  return { id: `${detachmentId}/${routeSlug(rule.name)}`, kind: 'detachment', name: rule.name, description: rule.description }
}

/** Drops alerts for detachment rules the roster does not field. */
export function remindersForDetachments<Reminder extends { key: string }>(
  reminders: readonly Reminder[],
  detachmentIds: readonly string[],
) {
  return reminders.filter((reminder) => {
    const [kind, ability = ''] = reminder.key.split(':')
    return kind !== 'detachment' || detachmentIds.includes(ability.split('/')[0] ?? '')
  })
}

export function suggestReminderWhileDestroyed(description: string): boolean {
  return /\b(?:if|when|each time) (?:this model|this unit|the bearer) is destroyed\b/iu.test(description.replaceAll(/\s+/gu, ' '))
}

type Candidate = { index: number; timing: ReminderTiming }

const phaseAt = (value: string): ReminderPhase | null => REMINDER_PHASES.find((phase) => phase === value.toLocaleLowerCase()) ?? null

const turnAt = (value: string | undefined): TurnScope => {
  const owner = plainQuotes(value?.toLocaleLowerCase() ?? '').trim()
  if (owner.includes('opponent')) return 'opponent-turn'
  if (owner.startsWith('your')) return 'your-turn'
  return 'either'
}

/** Whose turn or phase a timing names, captured for `turnAt`. */
const WHOSE = String.raw`(your opponent[’']s|the opponent[’']s|each player[’']s|either player[’']s|your|any|the)?`
const PHASE = '(command|movement|shooting|charge|fight)'

/** Suggest action timings while excluding duration and expiry clauses such as "until the start". */
export function suggestReminderTimings(description: string): ReminderTiming[] {
  const text = description.replaceAll(/\s+/gu, ' ')
  const candidates: Candidate[] = []
  const phasePattern = new RegExp(String.raw`\bat (?:the )?(start|end) of ${WHOSE}\s*${PHASE} phase\b`, 'giu')
  const turnPattern = new RegExp(String.raw`\bat (?:the )?(start|end) of ${WHOSE}\s*turn\b`, 'giu')
  const roundPattern = /\bat (?:the )?(start|end) of (?:the |each |every |a )?(first )?battle round\b/giu
  const genericPhasePattern = /\bat (?:the )?(start|end) of (?:any|each|a|the) phase\b/giu
  const broadPhasePattern = new RegExp(String.raw`\b(?:in|during) ${WHOSE}\s*(?:first |next )?${PHASE} phase\b`, 'giu')
  const additionalPhasePattern = new RegExp(String.raw`\b(?:or|and) ${WHOSE}\s*${PHASE} phase\b`, 'giu')

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

/** The round boundary a phase opens or closes: the first side's command phase or the other side's end phase. */
export function roundReminderMoment(phase: Phase, activeSide: number, firstSide: number): ReminderTiming | null {
  if (phase === 'command' && activeSide === firstSide) return { moment: 'round-start', phase: null, turn: 'either' }
  if (phase === 'end' && activeSide !== firstSide) return { moment: 'round-end', phase: null, turn: 'either' }
  return null
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
  return `${timing.moment === 'phase-start' ? 'Start' : 'End'} of ${owner} ${phaseName(timing.phase)} phase`
}

/** "Shooting" for `shooting`. */
export const phaseName = capitalised

export const TURN_LABELS: Record<TurnScope, string> = {
  'your-turn': 'Your turn',
  'opponent-turn': 'Opponent’s turn',
  either: 'Either turn',
}

/** When a stratagem can be used, as "Shooting, Fight phase · Your turn · Once per battle". */
export const stratagemTiming = (stratagem: Pick<Stratagem, 'phases' | 'turn' | 'limit'>) => [
  stratagem.phases?.length ? `${stratagem.phases.map(phaseName).join(', ')} phase` : 'Any phase',
  TURN_LABELS[stratagem.turn ?? 'either'],
  stratagem.limit === 'unlimited' ? 'No use limit' : `Once per ${stratagem.limit.replace('-', ' ')}`,
]

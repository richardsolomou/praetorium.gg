import { z } from 'zod'
import { saveRosterSchema } from '../contracts/schemas'
import type { CombatRequest } from '../core/combatMatchup'
import { noExclusions, strongestWeaponPreferences, type CombatantSnapshot } from '../core/combatMatchup'
import {
  bestRosterMatches,
  rosterCombatIndices,
  rosterCombatRequest,
  summarizeRosterCombat,
  type CombatMetric,
  type RosterCombatSummary,
} from '../core/rosterCombatTable'
import { forEachConcurrently } from '../shared/forEachConcurrently'
import { defaultSnapshot, unitTotal, withReadRules } from '../shared/rosterGradeMeasures'
import { rosterCombatants } from '../shared/rosterCombatants'
import { READ_ONLY_TOOL, structured, toolError, type AgentTools } from './agentTools'
import { app } from './app'
import { combatCalculationPool } from './combatCalculationPool'
import { serverWords } from './publishedTextFiles'

// The table holds the shared workers simulate_combat and grading use, so one request may not hold them for long.
const COMPARISON_TIMEOUT_MS = 30_000
// A 3,000-point list fields about 25 units; past that the answer grows beyond what an agent can read.
const MAX_PAIRINGS = 625
// The pool refuses work beyond 64 pending calculations, so a few pairings run at once, each asking a few calculations at a time.
const LANES = 4
const BATCH = 4

const PHASES = { shooting: 'ranged', melee: 'melee', shootingThenMelee: 'combined' } as const
type Phase = keyof typeof PHASES
const MEASURES = {
  expectedModelsDestroyed: 'meanKills',
  expectedWoundsLost: 'meanDamage',
  destroyedChance: 'wipe',
} as const satisfies Record<string, CombatMetric>
type Measure = keyof typeof MEASURES

const phaseNames = Object.keys(PHASES) as [Phase, ...Phase[]]
const measureNames = Object.keys(MEASURES) as [Measure, ...Measure[]]

const inputSchema = z.object({
  attacker: saveRosterSchema.describe('The attacking roster, in the shape save_roster and check_roster take.'),
  defender: saveRosterSchema.describe('The defending roster, in the same shape.'),
  phases: z.array(z.enum(phaseNames)).min(1).max(phaseNames.length).optional().describe('Phases to return; defaults to all three.'),
  measures: z
    .array(z.enum(measureNames))
    .min(1)
    .max(measureNames.length)
    .optional()
    .describe('Numbers each pairing holds, in this order; defaults to all three.'),
  rankBy: z.enum(measureNames).default('expectedWoundsLost').describe('The measure best targets and best attackers are ranked by.'),
})
type Input = z.infer<typeof inputSchema>
type Roster = Input['attacker']

type TableUnit = { name: string; entries: number[]; models: number; snapshot: CombatantSnapshot | null; error?: string }

/** Each unit the roster fields with its attached units, as the simulator's whole-roster table fields it at full strength. */
async function tableUnits(roster: Roster): Promise<TableUnit[] | null> {
  const instance = app()
  const [loaded, rules] = await Promise.all([instance.catalogueFor(roster.catalogueId), instance.rulesFor(roster.catalogueId)])
  if (!loaded) return null
  const words = await serverWords()
  const pickIndices = rosterCombatIndices(roster.picks)
  const projections = rosterCombatants(loaded, rules, {
    catalogueId: roster.catalogueId,
    detachmentIds: roster.detachmentIds,
    picks: roster.picks,
    pickIndices,
    inactivePicks: [],
  })
  return pickIndices.map((pickIndex, at) => {
    const unread = projections[at]
    const pick = roster.picks[pickIndex]!
    if (!unread)
      return {
        name: loaded.index.definitions.get(pick.entryId)?.name ?? `Entry ${pickIndex + 1}`,
        entries: [pickIndex + 1],
        models: 0,
        snapshot: null,
        error: 'This unit is missing from the current army data.',
      }
    const projection = withReadRules(unread, words)
    const members = [projection, ...projection.companions]
    const unit = {
      name: members.map((member) => member.selected.name).join(' + '),
      entries: [pickIndex + 1, ...projection.companions.map((member) => member.pickIndex + 1)],
      models: members.reduce((total, member) => total + member.models, 0),
    }
    if (pick.models !== undefined && projection.models !== pick.models)
      return { ...unit, snapshot: null, error: `This unit cannot field ${pick.models} models; use a legal unit size.` }
    const snapshot = { ...defaultSnapshot(projection), allocationRequired: projection.attachmentErrors.length > 0 }
    const error = projection.attachmentErrors.map((problem) => `${problem.entryName} ${problem.message}.`).join(' ')
    return { ...unit, snapshot, ...(error ? { error } : {}) }
  })
}

const BUSY = 'The calculation service is busy.'

/** Every pairing of the two sides' units it could finish before `signal` aborts, keyed by `row:column`. */
async function calculateTable(attackers: TableUnit[], defenders: TableUnit[], signal: AbortSignal) {
  const stop = new AbortController()
  const abort = () => stop.abort(signal.reason)
  signal.addEventListener('abort', abort, { once: true })
  const calculate = async (requests: CombatRequest[]) => {
    const answers = []
    for (let start = 0; start < requests.length; start += BATCH)
      answers.push(
        ...(await Promise.all(
          requests.slice(start, start + BATCH).map((request) => combatCalculationPool.calculate(request, stop.signal)),
        )),
      )
    return answers
  }
  // Repeated units, such as two identical squads, share one calculation per opponent.
  const identities = new Map<string, number>()
  const identity = (unit: TableUnit) => {
    const key = JSON.stringify([unit.snapshot, unit.error])
    if (!identities.has(key)) identities.set(key, identities.size)
    return identities.get(key)!
  }
  const rows = attackers.map(identity)
  const columns = defenders.map(identity)
  const pairings = new Map<string, Promise<RosterCombatSummary>>()
  const results = new Map<string, RosterCombatSummary>()
  let stoppedBy: string | undefined
  const cells = [...attackers.keys()].flatMap((row) => [...defenders.keys()].map((column) => [row, column] as const))
  try {
    await forEachConcurrently(
      cells,
      LANES,
      async ([row, column]) => {
        const attacker = attackers[row]!
        const defender = defenders[column]!
        const key = `${rows[row]}:${columns[column]}`
        const pairing =
          pairings.get(key) ??
          (async () => {
            const preferences = await strongestWeaponPreferences(
              attacker.snapshot,
              defender.snapshot,
              { preferences: {}, excluded: noExclusions(), allocation: [] },
              {},
              calculate,
            )
            const { request, unavailable } = rosterCombatRequest(
              attacker.snapshot,
              defender.snapshot,
              attacker.error ?? defender.error,
              preferences,
            )
            return summarizeRosterCombat(await combatCalculationPool.calculate(request, stop.signal), unavailable)
          })()
        pairings.set(key, pairing)
        try {
          results.set(`${row}:${column}`, await pairing)
        } catch (error) {
          if (stop.signal.aborted) return
          const message = error instanceof Error ? error.message : String(error)
          // Someone else holds the shared workers, so the rest of the table waits for another request.
          if (message === BUSY) {
            stoppedBy = 'The simulator was busy, so the table stopped early.'
            stop.abort(error)
            return
          }
          const failed = { error: message }
          results.set(`${row}:${column}`, { ranged: failed, melee: failed, combined: failed })
        }
      },
      stop.signal,
    )
  } finally {
    signal.removeEventListener('abort', abort)
  }
  return { results, stoppedBy: stoppedBy ?? (signal.aborted ? 'The table reached its time limit.' : undefined) }
}

const rounded = (measure: Measure, value: number) => {
  const places = measure === 'destroyedChance' ? 1_000 : 100
  return Math.round(value * places) / places
}

export async function compareRosters(input: Input, signal: AbortSignal) {
  for (const [side, roster] of [
    ['attacking', input.attacker],
    ['defending', input.defender],
  ] as const) {
    try {
      rosterCombatIndices(roster.picks)
    } catch (error) {
      return toolError('refused', `The ${side} roster cannot be compared: ${(error as Error).message}`)
    }
  }
  const [attackers, defenders] = await Promise.all([tableUnits(input.attacker), tableUnits(input.defender)])
  if (!attackers || !defenders) return toolError('unavailable', 'Praetorium army data is temporarily unavailable.')
  if (!attackers.length || !defenders.length) return toolError('refused', 'Both rosters need at least one unit.')
  const total = attackers.length * defenders.length
  if (total > MAX_PAIRINGS)
    return toolError(
      'refused',
      `These rosters make ${total} pairings; compare at most ${MAX_PAIRINGS}. Pass a smaller roster, such as part of a list.`,
    )
  const { results, stoppedBy } = await calculateTable(attackers, defenders, signal)
  const phases = input.phases ?? phaseNames
  const measures = input.measures ?? measureNames
  const notCalculated = new Map<string, { phase: Phase; reason: string; pairings: [number, number][] }>()
  const table = (phase: Phase) => {
    const key = PHASES[phase]
    const cell = (row: number, column: number) => results.get(`${row}:${column}`)?.[key]
    const rows = [...attackers.keys()]
    const columns = [...defenders.keys()]
    const cells = rows.map((row) =>
      columns.map((column) => {
        const answer = cell(row, column)
        const reason = !answer ? 'Not finished before the table stopped.' : answer.result ? null : (answer.error ?? 'Not calculated.')
        if (reason === null) return measures.map((measure) => rounded(measure, answer!.result![MEASURES[measure]]))
        const group = notCalculated.get(`${phase}\n${reason}`) ?? { phase, reason, pairings: [] }
        group.pairings.push([row, column])
        notCalculated.set(`${phase}\n${reason}`, group)
        return null
      }),
    )
    const metric = MEASURES[input.rankBy]
    return {
      cells,
      bestTargetOf: rows.map((row) =>
        bestRosterMatches(
          columns.map((column) => cell(row, column)),
          metric,
        ),
      ),
      bestAttackerOf: columns.map((column) =>
        bestRosterMatches(
          rows.map((row) => cell(row, column)),
          metric,
        ),
      ),
    }
  }
  const unit = ({ name, entries, models, snapshot }: TableUnit) => ({
    name,
    entries,
    models,
    ...(snapshot ? { wounds: unitTotal(snapshot, 'wounds') } : {}),
  })
  return structured({
    status: results.size === total ? 'complete' : 'partial',
    ...(stoppedBy && results.size < total ? { stoppedBy } : {}),
    pairings: total,
    calculated: results.size,
    attackers: attackers.map(unit),
    defenders: defenders.map(unit),
    measures,
    rankBy: input.rankBy,
    ...Object.fromEntries(phases.map((phase) => [phase, table(phase)])),
    notCalculated: [...notCalculated.values()],
  })
}

export function registerRosterComparisonTools(tools: AgentTools) {
  tools.registerTool(
    'compare_rosters',
    {
      title: 'Compare two rosters in combat',
      description:
        "Runs every unit of one roster, with its attached units, against every unit of another in Praetorium's exact combat simulator, as the simulator's whole-roster table does: one call instead of a simulate_combat call per pairing. attackers and defenders list the units in roster order, entries giving their 1-based roster entries as check_roster numbers them. Each phase's cells[attacker][defender] holds the measures in the order measures names, or null when that pairing could not be calculated; notCalculated groups those by phase and reason. bestTargetOf[attacker] lists the defenders that attacker does most to, and bestAttackerOf[defender] the attackers that do most to that defender, by rankBy; each is judged alone, ignores pairings it could not calculate, and is empty while any pairing in its row or column is unfinished or nothing does damage. Units start at full strength in default conditions: passive rules apply, while stratagems, conditional rules, cover and range bonuses stay off, and each weapon choice takes the option that does most against that target. A partial status means the table stopped early, as stoppedBy says; its finished pairings stand. Two 2,000-point lists take a second or two, and the table stops after 30 seconds. Drill into one pairing with simulate_combat to choose rules, modifiers or losses.",
      inputSchema,
      annotations: READ_ONLY_TOOL,
    },
    (input) => compareRosters(input, AbortSignal.timeout(COMPARISON_TIMEOUT_MS)),
  )
}

import type { CombatPhase } from '../../../core/combat'
import { combatantDatasheets } from '../../functions'
import { combatCalculator, readCombatAnswer } from './combatCalculation'
import { COMBAT_BATCH_SIZE } from '../../../contracts/combatCalculation'
import { errorMessage } from '../../queryClient'
import { forEachConcurrently } from '../../../shared/forEachConcurrently'
import type { CombatAnswer, CombatRequest } from '../../../core/combatMatchup'
import type { CombatRoster } from './useCombatant'
import { readRosterCombatCache, writeRosterCombatCache } from './rosterCombatCache'
import {
  rosterCombatIndices,
  rosterCombatRequest,
  rosterCombatSnapshot,
  summarizeRosterCombat,
  type RosterCombatSummary,
  type RosterCombatUnit,
} from './rosterCombat'

const MAX_ROSTER_MATCHUPS = 2500
export const ROSTER_COMBAT_TIMEOUT = 300_000
const CONCURRENT_MATCHUPS = 4

export async function runRosterCombat({
  attacker,
  defender,
  signal,
  onPrepared,
  onResult,
}: {
  attacker: CombatRoster | readonly CombatRoster[]
  defender: CombatRoster | readonly CombatRoster[]
  signal: AbortSignal
  onPrepared: (attackers: RosterCombatUnit[], defenders: RosterCombatUnit[]) => void
  onResult: (row: number, column: number, result: RosterCombatSummary) => void
}) {
  signal.throwIfAborted()
  const attackingRosters = 'picks' in attacker ? [attacker] : attacker
  const defendingRosters = 'picks' in defender ? [defender] : defender
  const unitIndices = (rosters: readonly CombatRoster[]) =>
    rosters.flatMap((roster, rosterIndex) =>
      rosterCombatIndices(roster.picks)
        .filter(
          (pickIndex) => (!roster.battle || roster.battle.units[pickIndex]?.available) && (!roster.only || pickIndex === roster.pickIndex),
        )
        .map((pickIndex) => ({ rosterIndex, pickIndex })),
    )
  const rows = unitIndices(attackingRosters)
  const columns = unitIndices(defendingRosters)
  if (!rows.length || !columns.length) throw new Error('Choose two rosters with units to compare.')
  if (rows.length * columns.length > MAX_ROSTER_MATCHUPS)
    throw new Error(`Compare at most ${MAX_ROSTER_MATCHUPS.toLocaleString('en')} pairings at a time. Choose smaller rosters.`)
  const prepare = async (rosters: readonly CombatRoster[], indices: { rosterIndex: number; pickIndex: number }[]) => {
    type Projection = Awaited<ReturnType<typeof combatantDatasheets>>[number] | { error: string }
    const projections: Projection[][] = []
    await forEachConcurrently(
      rosters,
      CONCURRENT_MATCHUPS,
      async (roster, rosterIndex) => {
        const pickIndices = indices.filter((index) => index.rosterIndex === rosterIndex).map((index) => index.pickIndex)
        if (!pickIndices.length) {
          projections[rosterIndex] = []
          return
        }
        try {
          projections[rosterIndex] = await combatantDatasheets({
            signal,
            data: {
              catalogueId: roster.catalogueId,
              detachmentIds: [...roster.detachmentIds],
              picks: [...roster.picks],
              pickIndices,
              inactivePicks: roster.battle?.units.flatMap((unit, index) => (unit.available ? [] : [index])) ?? [],
            },
          })
        } catch (error) {
          signal.throwIfAborted()
          projections[rosterIndex] = pickIndices.map(() => ({ error: errorMessage(error) }))
        }
      },
      signal,
    )
    signal.throwIfAborted()
    const positions = rosters.map(() => 0)
    return indices.map(({ rosterIndex, pickIndex }): RosterCombatUnit => {
      const roster = rosters[rosterIndex]!
      const pick = roster.picks[pickIndex]!
      const data = projections[rosterIndex]![positions[rosterIndex]!]!
      positions[rosterIndex]! += 1
      const owner = roster.owner ? { owner: roster.owner } : {}
      try {
        if (!data) throw new Error('This unit could not be loaded under the roster’s selected rules.')
        if ('error' in data) throw new Error(data.error)
        if (pick.models !== undefined && data.models !== pick.models)
          throw new Error(`This unit cannot field ${pick.models} models under its selected rules. Use a legal model count.`)
        return {
          rosterIndex,
          pickIndex,
          name: [data.selected.name, ...data.companions.map((member) => member.selected.name)].join(' + '),
          ...owner,
          snapshot: rosterCombatSnapshot(data, roster.picks, roster.battle ? { units: roster.battle.units, pickIndex } : undefined),
          live: Boolean(roster.battle),
          ...(data.attachmentErrors.length ? { error: data.attachmentErrors.map((error) => error.message).join('; ') } : {}),
        }
      } catch (error) {
        return { rosterIndex, pickIndex, name: `Unit ${pickIndex + 1}`, ...owner, snapshot: null, error: errorMessage(error) }
      }
    })
  }
  const [attackers, defenders] = await Promise.all([prepare(attackingRosters, rows), prepare(defendingRosters, columns)])
  signal.throwIfAborted()
  const key = JSON.stringify({
    attackers: attackers.map(({ snapshot, error }) => ({ snapshot, error })),
    defenders: defenders.map(({ snapshot, error }) => ({ snapshot, error })),
  })
  const cached = readRosterCombatCache(key)
  if (cached) {
    onPrepared(attackers, defenders)
    cached.forEach((result, index) => {
      signal.throwIfAborted()
      onResult(Math.floor(index / defenders.length), index % defenders.length, result)
    })
    return
  }
  onPrepared(attackers, defenders)
  const pool = new AbortController()
  const abort = () => pool.abort(signal.reason)
  let next = 0
  const total = attackers.length * defenders.length
  const results: RosterCombatSummary[] = Array.from({ length: total })
  let cacheable = [...attackers, ...defenders].every((unit) => !unit.error)
  const jobs = new Map<string, { request: CombatRequest; cells: { index: number; unavailable: Partial<Record<CombatPhase, string>> }[] }>()
  const publish = (index: number, answer: CombatAnswer, unavailable: Partial<Record<CombatPhase, string>>) => {
    signal.throwIfAborted()
    const result = summarizeRosterCombat(answer, unavailable)
    results[index] = result
    onResult(Math.floor(index / defenders.length), index % defenders.length, result)
  }
  for (let index = 0; index < total; index++) {
    const unit = attackers[Math.floor(index / defenders.length)]!
    const target = defenders[index % defenders.length]!
    const { request, unavailable } = rosterCombatRequest(unit.snapshot, target.snapshot, unit.error ?? target.error)
    const hit = readCombatAnswer(request)
    if (hit) publish(index, hit, unavailable)
    else {
      const requestKey = JSON.stringify(request)
      const job = jobs.get(requestKey) ?? { request, cells: [] }
      job.cells.push({ index, unavailable })
      jobs.set(requestKey, job)
    }
  }
  const pending = [...jobs.values()]
  signal.addEventListener('abort', abort, { once: true })
  const calculators: ReturnType<typeof combatCalculator>[] = []
  const calculate = async () => {
    const calculator = combatCalculator()
    calculators.push(calculator)
    while (next < pending.length) {
      pool.signal.throwIfAborted()
      const batch = pending.slice(next, next + COMBAT_BATCH_SIZE)
      next += batch.length
      const requests = batch.map((job) => job.request)
      const answers = await calculator.calculate(requests, pool.signal)
      if (calculator.failed) cacheable = false
      pool.signal.throwIfAborted()
      batch.forEach((job, index) => {
        const answer = answers[index]!
        for (const cell of job.cells) publish(cell.index, answer, cell.unavailable)
      })
    }
  }
  try {
    signal.throwIfAborted()
    await Promise.all(Array.from({ length: Math.min(CONCURRENT_MATCHUPS, Math.ceil(pending.length / COMBAT_BATCH_SIZE)) }, calculate))
    signal.throwIfAborted()
    if (cacheable) writeRosterCombatCache(key, results)
  } catch (error) {
    pool.abort(error)
    throw error
  } finally {
    for (const calculator of calculators) calculator.dispose()
    signal.removeEventListener('abort', abort)
  }
}

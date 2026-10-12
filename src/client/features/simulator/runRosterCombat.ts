import { combatantDatasheet } from '../../functions'
import { errorMessage } from '../../queryClient'
import type { CombatAnswer, CombatRequest } from '../../../core/combatMatchup'
import type { CombatRoster } from './useCombatant'
import CombatWorker from './combatWorker'
import { readRosterCombatCache, writeRosterCombatCache } from './rosterCombatCache'
import {
  rosterCombatIndices,
  rosterCombatRequest,
  rosterCombatSnapshot,
  summarizeRosterCombat,
  type RosterCombatSummary,
  type RosterCombatUnit,
} from './rosterCombat'

export const MAX_ROSTER_MATCHUPS = 2500
export const ROSTER_COMBAT_TIMEOUT = 300_000
const CONCURRENT_MATCHUPS = 4

export function calculateRosterPair(request: CombatRequest, signal: AbortSignal, onFailure?: () => void): Promise<CombatAnswer> {
  signal.throwIfAborted()
  if (!request.ranged && !request.melee) return Promise.resolve({ ranged: null, melee: null })
  return new Promise((resolve, reject) => {
    let active = true
    let worker: Worker | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    const stop = () => {
      if (!active) return
      active = false
      clearTimeout(timer)
      worker?.terminate()
      signal.removeEventListener('abort', abort)
    }
    const fail = (message: string) => {
      if (!active) return
      stop()
      onFailure?.()
      resolve({
        ranged: request.ranged ? { error: message } : null,
        melee: request.melee ? { error: message } : null,
        combined: { error: message },
      })
    }
    const abort = () => {
      stop()
      reject(signal.reason)
    }
    signal.addEventListener('abort', abort, { once: true })
    try {
      worker = new CombatWorker()
      worker.onmessage = (event: MessageEvent<CombatAnswer>) => {
        if (!active) return
        stop()
        resolve(event.data)
      }
      worker.onerror = () => fail('The calculation failed. Run the comparison again to retry.')
      worker.onmessageerror = () => fail('The calculation response could not be read. Try again.')
      timer = setTimeout(() => fail('This pairing took too long to calculate. Try it in the unit simulator.'), 15_000)
      worker.postMessage(request)
    } catch {
      fail('The calculation could not start. This browser must support Web Workers.')
    }
  })
}

export async function runRosterCombat({
  attacker,
  defender,
  signal,
  cachedOnly = false,
  force = false,
  onPrepared,
  onResult,
}: {
  attacker: CombatRoster | readonly CombatRoster[]
  defender: CombatRoster | readonly CombatRoster[]
  signal: AbortSignal
  cachedOnly?: boolean
  force?: boolean
  onPrepared: (attackers: RosterCombatUnit[], defenders: RosterCombatUnit[]) => void
  onResult: (row: number, column: number, result: RosterCombatSummary) => void
}) {
  signal.throwIfAborted()
  const attackingRosters = 'picks' in attacker ? [attacker] : attacker
  const defendingRosters = 'picks' in defender ? [defender] : defender
  const unitIndices = (rosters: readonly CombatRoster[]) =>
    rosters.flatMap((roster, rosterIndex) =>
      rosterCombatIndices(roster.picks)
        .filter((pickIndex) => !roster.battle || roster.battle.units[pickIndex]?.available)
        .map((pickIndex) => ({ rosterIndex, pickIndex })),
    )
  const rows = unitIndices(attackingRosters)
  const columns = unitIndices(defendingRosters)
  if (!rows.length || !columns.length) throw new Error('Choose two rosters with units to compare.')
  if (rows.length * columns.length > MAX_ROSTER_MATCHUPS)
    throw new Error(`Compare at most ${MAX_ROSTER_MATCHUPS.toLocaleString()} pairings at a time. Choose smaller rosters.`)
  const prepare = async (rosters: readonly CombatRoster[], indices: { rosterIndex: number; pickIndex: number }[]) => {
    const units: RosterCombatUnit[] = []
    for (const { rosterIndex, pickIndex } of indices) {
      signal.throwIfAborted()
      const roster = rosters[rosterIndex]!
      const pick = roster.picks[pickIndex]!
      try {
        const data = await combatantDatasheet({
          signal,
          data: {
            catalogueId: roster.catalogueId,
            entryId: pick.entryId,
            detachmentIds: [...roster.detachmentIds],
            picks: [...roster.picks],
            pickIndex,
            inactivePicks: roster.battle?.units.flatMap((unit, index) => (unit.available ? [] : [index])),
          },
        })
        signal.throwIfAborted()
        if (!data) throw new Error('This unit could not be loaded under the roster’s selected rules.')
        if (pick.models !== undefined && data.models !== pick.models)
          throw new Error(`This unit cannot field ${pick.models} models under its selected rules. Use a legal model count.`)
        units.push({
          rosterIndex,
          pickIndex,
          name: [data.selected.name, ...data.companions.map((member) => member.selected.name)].join(' + '),
          snapshot: rosterCombatSnapshot(data, roster.picks, roster.battle ? { units: roster.battle.units, pickIndex } : undefined),
          live: Boolean(roster.battle),
          ...(data.attachmentErrors.length ? { error: data.attachmentErrors.map((error) => error.message).join('; ') } : {}),
        })
      } catch (error) {
        signal.throwIfAborted()
        units.push({ rosterIndex, pickIndex, name: `Unit ${pickIndex + 1}`, snapshot: null, error: errorMessage(error) })
      }
    }
    return units
  }
  const attackers = await prepare(attackingRosters, rows)
  const defenders = await prepare(defendingRosters, columns)
  signal.throwIfAborted()
  const key = JSON.stringify({
    attackers: attackers.map(({ snapshot, error }) => ({ snapshot, error })),
    defenders: defenders.map(({ snapshot, error }) => ({ snapshot, error })),
  })
  const cached = force ? undefined : readRosterCombatCache(key)
  if (cached) {
    onPrepared(attackers, defenders)
    cached.forEach((result, index) => {
      signal.throwIfAborted()
      onResult(Math.floor(index / defenders.length), index % defenders.length, result)
    })
    return true
  }
  if (cachedOnly) return false
  onPrepared(attackers, defenders)
  const pool = new AbortController()
  const abort = () => pool.abort(signal.reason)
  signal.addEventListener('abort', abort, { once: true })
  let next = 0
  const total = attackers.length * defenders.length
  const results: RosterCombatSummary[] = Array.from({ length: total })
  let cacheable = [...attackers, ...defenders].every((unit) => !unit.error)
  const calculate = async () => {
    while (next < total) {
      pool.signal.throwIfAborted()
      const index = next++
      const row = Math.floor(index / defenders.length)
      const column = index % defenders.length
      const unit = attackers[row]!
      const target = defenders[column]!
      const { request, unavailable } = rosterCombatRequest(unit.snapshot, target.snapshot, unit.error ?? target.error)
      const answer = await calculateRosterPair(request, pool.signal, () => {
        cacheable = false
      })
      pool.signal.throwIfAborted()
      const result = summarizeRosterCombat(answer, unavailable)
      results[index] = result
      onResult(row, column, result)
    }
  }
  try {
    signal.throwIfAborted()
    await Promise.all(Array.from({ length: Math.min(CONCURRENT_MATCHUPS, total) }, calculate))
    signal.throwIfAborted()
    if (cacheable) writeRosterCombatCache(key, results)
  } catch (error) {
    pool.abort(error)
    throw error
  } finally {
    signal.removeEventListener('abort', abort)
  }
  return false
}

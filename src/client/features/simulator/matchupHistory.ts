import { useMemo } from 'react'
import { z } from 'zod'
import { decodeSimulatorState, type SimulatorState } from '../../../contracts/simulatorState'
import { readStoredValue, useStoredValue, writeStoredValue } from '../../storedValue'
import type { CombatUnitIndex } from './benchmarks'

const KEY = 'praetorium:recent-matchups:v1'
const LIMIT = 6
const entrySchema = z.object({ shared: z.string().max(8_000), attacker: z.string().min(1).max(200), defender: z.string().min(1).max(200) })
export type RecentMatchup = z.infer<typeof entrySchema>

function pairing(shared: string) {
  const state = decodeSimulatorState(shared)
  if (!state?.sides.every(Boolean)) return null
  return JSON.stringify([
    state.swapped,
    state.sides.map((side) => [side!.catalogueId, side!.pick.entryId, side!.attached?.map((pick) => [pick.catalogueId, pick.entryId])]),
  ])
}

export function parseMatchupHistory(raw: string | null): RecentMatchup[] {
  if (!raw || raw.length > 60_000) return []
  try {
    const value: unknown = JSON.parse(raw)
    if (!Array.isArray(value)) return []
    return value
      .flatMap((entry) => {
        const parsed = entrySchema.safeParse(entry)
        return parsed.success && pairing(parsed.data.shared) ? [parsed.data] : []
      })
      .slice(0, LIMIT)
  } catch {
    return []
  }
}

export function withRecentMatchup(recent: readonly RecentMatchup[], entry: RecentMatchup): RecentMatchup[] {
  const parsed = entrySchema.safeParse(entry)
  const key = parsed.success ? pairing(parsed.data.shared) : null
  return key ? [parsed.data!, ...recent.filter((old) => pairing(old.shared) !== key)].slice(0, LIMIT) : [...recent]
}

export function rememberMatchup(entry: RecentMatchup) {
  const recent = withRecentMatchup(parseMatchupHistory(readStoredValue(KEY)), entry)
  writeStoredValue(KEY, JSON.stringify(recent))
}

export function forgetMatchup(shared: string) {
  const recent = parseMatchupHistory(readStoredValue(KEY)).filter((entry) => entry.shared !== shared)
  writeStoredValue(KEY, recent.length ? JSON.stringify(recent) : null)
}

export function useRecentMatchups() {
  const raw = useStoredValue(KEY)
  return useMemo(() => parseMatchupHistory(raw), [raw])
}

export function exampleMatchup(index: CombatUnitIndex): SimulatorState | null {
  const side = (faction: string, name: string) => {
    const book = index.find((candidate) => candidate.name === faction)
    const unit = book?.units.find((candidate) => candidate.name === name)
    return book && unit ? { catalogueId: book.catalogueId, pick: { entryId: unit.id, catalogueId: book.catalogueId }, rules: {} } : null
  }
  const sides: SimulatorState['sides'] = [side('Space Marines', 'Intercessor Squad'), side('Necrons', 'Necron Warriors')]
  return sides.every(Boolean) ? { v: 1, sides, swapped: false } : null
}

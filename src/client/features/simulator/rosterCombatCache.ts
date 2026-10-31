import { RecentlyUsed } from '../../../core/collections'
import { BoundedCache } from '../../../shared/boundedCache'
import type { RosterCombatSummary } from './rosterCombat'

const MAX_ENTRIES = 20
const cache = new BoundedCache<string, RosterCombatSummary[]>(8 * 1024 * 1024, MAX_ENTRIES, (key) => key)

export const readRosterCombatCache = (key: string) => cache.read(key)
export const writeRosterCombatCache = (key: string, results: RosterCombatSummary[]) => cache.write(key, results)
export const clearRosterCombatCache = () => cache.clear()

const selections = new RecentlyUsed<string, { attacker: readonly string[]; defender: readonly string[] }>(MAX_ENTRIES)

export const readRosterCombatSelection = (key: string) => selections.get(key)

export function writeRosterCombatSelection(key: string, attacker: readonly string[], defender: readonly string[]) {
  selections.set(key, { attacker, defender })
}

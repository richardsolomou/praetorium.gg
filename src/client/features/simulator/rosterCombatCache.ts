import type { RosterCombatSummary } from './rosterCombat'

const MAX_ENTRIES = 20
const MAX_BYTES = 8 * 1024 * 1024
const cache = new Map<string, { results: RosterCombatSummary[]; bytes: number }>()
let bytes = 0

export const hasRosterCombatCache = () => cache.size > 0

export function readRosterCombatCache(key: string) {
  const entry = cache.get(key)
  if (!entry) return undefined
  cache.delete(key)
  cache.set(key, entry)
  return structuredClone(entry.results)
}

export function writeRosterCombatCache(key: string, results: RosterCombatSummary[]) {
  const size = (key.length + JSON.stringify(results).length) * 2
  if (size > MAX_BYTES) return
  const previous = cache.get(key)
  if (previous) bytes -= previous.bytes
  cache.delete(key)
  cache.set(key, { results: structuredClone(results), bytes: size })
  bytes += size
  while (cache.size > MAX_ENTRIES || bytes > MAX_BYTES) {
    const oldest = cache.keys().next().value!
    bytes -= cache.get(oldest)!.bytes
    cache.delete(oldest)
  }
}

export function clearRosterCombatCache() {
  cache.clear()
  bytes = 0
}

const selections = new Map<string, { attacker: string; defender: string }>()

export function readRosterCombatSelection(key: string) {
  return selections.get(key)
}

export function writeRosterCombatSelection(key: string, attacker: string, defender: string) {
  selections.delete(key)
  selections.set(key, { attacker, defender })
  if (selections.size > MAX_ENTRIES) selections.delete(selections.keys().next().value!)
}

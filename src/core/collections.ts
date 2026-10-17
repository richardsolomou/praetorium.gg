/**
 * What each key gathers, in the order the keys first appear.
 *
 * `Map.groupBy` says the same thing, but it is ES2024 and this project pins its
 * library floor at ES2023. Replace this when that floor moves.
 */
export function groupBy<T, K>(entries: Iterable<T>, keyOf: (entry: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>()
  for (const entry of entries) {
    const key = keyOf(entry)
    const group = groups.get(key)
    if (group) group.push(entry)
    else groups.set(key, [entry])
  }
  return groups
}

/** The first value for each key, in order. */
export function uniqueBy<T>(values: readonly T[], keyOf: (value: T) => unknown): T[] {
  const seen = new Set<unknown>()
  return values.filter((value) => {
    const key = keyOf(value)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

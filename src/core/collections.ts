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

/** How many entries share each key, in the order the keys first appear. */
export function countBy<T, K>(entries: Iterable<T>, keyOf: (entry: T) => K): Map<K, number> {
  const counts = new Map<K, number>()
  for (const entry of entries) {
    const key = keyOf(entry)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
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

/** `compute()` once per key of `store`; undefined and null results are cached too. */
export function remember<K, T>(
  store: { has(key: K): boolean; get(key: K): T | undefined; set(key: K, value: T): unknown },
  key: K,
  compute: () => T,
): T {
  if (store.has(key)) return store.get(key)!
  const value = compute()
  store.set(key, value)
  return value
}

/** `compute()` once per owner and key, kept for as long as the owner lives; undefined and null results are cached too. */
export function cachedIn<O extends WeakKey, T>(store: WeakMap<O, Map<string, T>>, owner: O, key: string, compute: () => T): T {
  const cache = remember(store, owner, () => new Map<string, T>())
  if (cache.has(key)) return cache.get(key)!
  const value = compute()
  cache.set(key, value)
  return value
}

/** Evicts the least recently used entry once it holds more than its limit. */
export class RecentlyUsed<K, V> extends Map<K, V> {
  constructor(private readonly limit: number) {
    super()
  }
  override get(key: K) {
    if (!super.has(key)) return undefined
    const value = super.get(key) as V
    super.delete(key)
    super.set(key, value)
    return value
  }
  override set(key: K, value: V) {
    super.delete(key)
    super.set(key, value)
    if (this.size > this.limit) this.delete(this.keys().next().value as K)
    return this
  }
}

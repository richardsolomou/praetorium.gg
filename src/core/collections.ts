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

/** Each value under its id; a later duplicate replaces an earlier one. */
export const byId = <T extends { id: string }>(values: readonly T[]): Map<string, T> => new Map(values.map((value) => [value.id, value]))

/** `values` with `value` once, or without it, flipped when `present` is left out; `keyOf` says which values are the same one. */
export function withMember<T>(values: readonly T[], value: T, present?: boolean, keyOf: (value: T) => unknown = (same) => same): T[] {
  const key = keyOf(value)
  const has = values.some((other) => keyOf(other) === key)
  if (!(present ?? !has)) return values.filter((other) => keyOf(other) !== key)
  return has ? [...values] : [...values, value]
}

/** A copy of `set` with `value` in it or not, flipped when `present` is left out. */
export function toggled<T>(set: ReadonlySet<T>, value: T, present = !set.has(value)): Set<T> {
  const next = new Set(set)
  if (present) next.add(value)
  else next.delete(value)
  return next
}

/** `record` with `key` set to `value`, or without `key` when `value` is undefined. */
export function withEntry<V>(record: Readonly<Record<string, V>>, key: string, value: NoInfer<V> | undefined): Record<string, V> {
  if (value !== undefined) return { ...record, [key]: value }
  const { [key]: _removed, ...rest } = record
  return rest
}

/** `values` in consecutive runs of `size`, the last one shorter when they do not divide evenly. */
export const chunks = <T>(values: readonly T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size))

/** Whether two lists of distinct values hold the same ones, in any order. */
export const sameSet = <T>(left: readonly T[] = [], right: readonly T[] = []) =>
  left.length === right.length && left.every((value) => right.includes(value))

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

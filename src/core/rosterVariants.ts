import { ROSTER_NAME_MAX_LENGTH } from './battle'

/** The first `<base> · <n>` no list in the group holds, counting the base as the first. */
export function variantName(stem: string, taken: readonly string[]) {
  const names = new Set(taken)
  for (let number = 2; ; number++) {
    const suffix = ` · ${number}`
    const name = `${stem.slice(0, ROSTER_NAME_MAX_LENGTH - suffix.length).trimEnd()}${suffix}`
    if (!names.has(name)) return name
  }
}

/**
 * Sorted lists with each group gathered where its first member sorts, headed by its base.
 *
 * A group is keyed by the base id its variants store, so it outlives a deleted base and
 * is headed by its first remaining member instead.
 */
export function variantGroups<T extends { id: string; baseRosterId: string | null }>(sorted: readonly T[]) {
  const groups = new Map<string, T[]>()
  for (const roster of sorted) {
    const key = roster.baseRosterId ?? roster.id
    const group = groups.get(key)
    if (group) group.push(roster)
    else groups.set(key, [roster])
  }
  return [...groups].flatMap(([key, members]) => {
    const head = members.find((roster) => roster.id === key) ?? members[0]!
    return [{ roster: head, variant: false }, ...members.filter((roster) => roster !== head).map((roster) => ({ roster, variant: true }))]
  })
}

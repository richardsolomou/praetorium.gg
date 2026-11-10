export const ROSTER_GROUPINGS = ['none', 'faction', 'detachment', 'size'] as const
export type RosterGrouping = (typeof ROSTER_GROUPINGS)[number]

/** Where a roster is shown under a grouping: groups run in `rank` order, then by `label`. */
export type RosterGroup = { key: string; label: string; rank: number }

type Entry<T> = { roster: T; variant: boolean }

/** `variantGroups` entries gathered under their head's group, each group keeping the sorted order, so a variant set never splits. */
export function groupedEntries<T>(entries: readonly Entry<T>[], groupOf: (roster: T) => RosterGroup) {
  const groups = new Map<string, { group: RosterGroup; entries: Entry<T>[] }>()
  let current: { group: RosterGroup; entries: Entry<T>[] } | undefined
  for (const entry of entries) {
    if (!entry.variant || !current) {
      const group = groupOf(entry.roster)
      current = groups.get(group.key) ?? { group, entries: [] }
      groups.set(group.key, current)
    }
    current.entries.push(entry)
  }
  return [...groups.values()].toSorted(
    (left, right) => left.group.rank - right.group.rank || left.group.label.localeCompare(right.group.label),
  )
}

/**
 * The groups a page of `budget` rosters shows: a collapsed group only its heading, and nothing after the first group
 * cut short, so a collapsed heading never appears beyond rosters still to load.
 */
export function groupsPage<T>(
  groups: readonly { group: RosterGroup; entries: Entry<T>[] }[],
  collapsed: (key: string) => boolean,
  budget: number,
) {
  const shown: { group: RosterGroup; entries: Entry<T>[]; total: number }[] = []
  let left = budget
  for (const { group, entries } of groups) {
    if (collapsed(group.key)) {
      shown.push({ group, entries: [], total: entries.length })
      continue
    }
    if (left <= 0) return { shown, more: true }
    const taken = entries.slice(0, left)
    left -= taken.length
    shown.push({ group, entries: taken, total: entries.length })
    if (taken.length < entries.length) return { shown, more: true }
  }
  return { shown, more: false }
}

import { groupBy } from './collections'
import { ROSTER_NAME_MAX_LENGTH } from './battle'
import { compareText } from './text'

/** The first `<base> · <n>` no list in the group holds, counting the base as the first. */
export function variantName(stem: string, taken: readonly string[]) {
  const names = new Set(taken)
  for (let number = 2; ; number++) {
    const suffix = ` · ${number}`
    const name = `${stem.slice(0, ROSTER_NAME_MAX_LENGTH - suffix.length).trimEnd()}${suffix}`
    if (!names.has(name)) return name
  }
}

/** A variant group in the order it is offered: its base, then every other list in the order it was made. */
export function orderVariantGroup<T extends { id: string; createdAt: number | bigint }>(members: readonly T[], baseId: string) {
  return members.toSorted(
    (left, right) =>
      Number(right.id === baseId) - Number(left.id === baseId) ||
      (left.createdAt < right.createdAt ? -1 : left.createdAt > right.createdAt ? 1 : compareText(left.id, right.id)),
  )
}

/**
 * Sorted lists with each group gathered where its first member sorts, headed by its base.
 *
 * A group is keyed by the base id its variants store, so it outlives a deleted base and
 * is headed by its oldest remaining member instead.
 */
export function variantGroups<T extends { id: string; baseRosterId: string | null; createdAt: number }>(sorted: readonly T[]) {
  return [...groupBy(sorted, (roster) => roster.baseRosterId ?? roster.id)].flatMap(([key, members]) => {
    const head = orderVariantGroup(members, key)[0]!
    return [{ roster: head, variant: false }, ...members.filter((roster) => roster !== head).map((roster) => ({ roster, variant: true }))]
  })
}

/** `variantGroups` entries gathered into cards: each head with the variants drawn beneath it, and each entry's position kept. */
export function variantCards<T>(entries: readonly { roster: T; variant: boolean }[]) {
  const cards: { head: { roster: T; index: number }; variants: { roster: T; index: number }[] }[] = []
  entries.forEach(({ roster, variant }, index) => {
    const last = cards.at(-1)
    if (variant && last) last.variants.push({ roster, index })
    else cards.push({ head: { roster, index }, variants: [] })
  })
  return cards
}

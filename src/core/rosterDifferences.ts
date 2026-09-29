import type { RosterPick } from './roster'

type Compared = {
  catalogueId: string
  detachmentIds: readonly string[]
  disposition: string | null
  borrowedDetachmentId?: string | null
  limit: number
  picks: readonly RosterPick[]
  waivedRules: readonly string[]
  optionalRules?: readonly string[]
}

export type RosterUnitChange = { entryId: string; catalogueId?: string; count: number }
export type RosterSetupChange = 'faction' | 'size' | 'detachment' | 'disposition' | 'rules'

export type RosterDifferences = {
  setup: RosterSetupChange[]
  /** Detachment ids on one side only; `replaced` when the variant keeps none of its base's. */
  detachments: { added: string[]; removed: string[]; replaced: boolean }
  added: RosterUnitChange[]
  removed: RosterUnitChange[]
  /** Units of one datasheet on both sides whose models, wargear, Warlord or attachment differ. */
  loadouts: number
}

const sameSet = (left: readonly string[] = [], right: readonly string[] = []) =>
  left.length === right.length && left.every((value) => right.includes(value))

/** Object keys in a fixed order, so two equal choices serialise alike. */
const canonical = (value: unknown): unknown =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(
        Object.entries(value)
          .toSorted(([left], [right]) => left.localeCompare(right))
          .map(([key, field]) => [key, canonical(field)]),
      )
    : value

/** Units grouped by datasheet, each keyed by everything a player chose for it. */
function unitsOf(picks: readonly RosterPick[]) {
  const datasheets = new Map<string, { unit: RosterUnitChange; keys: string[] }>()
  for (const { attachedTo, ...pick } of picks) {
    const identity = `${pick.catalogueId ?? ''}:${pick.entryId}`
    // A position shifts whenever an earlier unit is added or removed, so a joined unit is compared by what it joins.
    const joins = attachedTo === undefined ? null : (picks[attachedTo]?.entryId ?? null)
    const key = JSON.stringify(canonical({ ...pick, joins }))
    const group = datasheets.get(identity)
    if (group) group.keys.push(key)
    else datasheets.set(identity, { unit: { entryId: pick.entryId, catalogueId: pick.catalogueId, count: 0 }, keys: [key] })
  }
  return datasheets
}

/**
 * How a variant differs from its base, independent of the order either lists its units.
 *
 * Within one datasheet, units whose choices match on both sides are unchanged, a
 * difference in count is units added or removed, and the rest are changed loadouts.
 * A different faction compares no units, since none of them can be the same.
 */
export function rosterDifferences(base: Compared, variant: Compared): RosterDifferences {
  const setup: RosterSetupChange[] = []
  if (base.catalogueId !== variant.catalogueId) setup.push('faction')
  if (base.limit !== variant.limit) setup.push('size')
  if (!sameSet(base.detachmentIds, variant.detachmentIds) || (base.borrowedDetachmentId ?? null) !== (variant.borrowedDetachmentId ?? null))
    setup.push('detachment')
  if (base.disposition !== variant.disposition) setup.push('disposition')
  if (!sameSet(base.waivedRules, variant.waivedRules) || !sameSet(base.optionalRules, variant.optionalRules)) setup.push('rules')
  const detachments = {
    added: variant.detachmentIds.filter((id) => !base.detachmentIds.includes(id)),
    removed: base.detachmentIds.filter((id) => !variant.detachmentIds.includes(id)),
    replaced: base.detachmentIds.length > 0 && base.detachmentIds.every((id) => !variant.detachmentIds.includes(id)),
  }
  if (setup.includes('faction')) return { setup, detachments, added: [], removed: [], loadouts: 0 }

  const before = unitsOf(base.picks)
  const after = unitsOf(variant.picks)
  const added: RosterUnitChange[] = []
  const removed: RosterUnitChange[] = []
  let loadouts = 0
  for (const identity of new Set([...before.keys(), ...after.keys()])) {
    const was = before.get(identity)
    const now = after.get(identity)
    const remaining = [...(was?.keys ?? [])]
    let unmatched = 0
    for (const key of now?.keys ?? []) {
      const at = remaining.indexOf(key)
      if (at === -1) unmatched++
      else remaining.splice(at, 1)
    }
    const difference = (now?.keys.length ?? 0) - (was?.keys.length ?? 0)
    if (difference > 0) added.push({ ...now!.unit, count: difference })
    if (difference < 0) removed.push({ ...was!.unit, count: -difference })
    loadouts += Math.min(unmatched, remaining.length)
  }
  return { setup, detachments, added, removed, loadouts }
}

/** Differences as a reader sees them, with each datasheet named and the base identified. */
export type NamedRosterDifferences = Omit<RosterDifferences, 'added' | 'removed'> & {
  baseId: string
  baseName: string
  added: { name: string; count: number }[]
  removed: { name: string; count: number }[]
}

export const sameRoster = (differences: RosterDifferences | NamedRosterDifferences) =>
  !differences.setup.length && !differences.added.length && !differences.removed.length && !differences.loadouts

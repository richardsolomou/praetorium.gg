import { type BattleSize, detachmentLimit, detachmentPointBudget, enforces, type FormatRuleId } from '../../core/battle'
import { routeSlug } from '../../core/slug'
import { countLabel } from '../text'

type DispositionOption = { id: string; name: string }

const dispositionTones: Record<string, { quiet: string; strong: string }> = {
  'take-and-hold': {
    quiet: 'border-achieved/60 bg-achieved/10 text-achieved',
    strong: 'border-achieved bg-achieved/25 text-bone',
  },
  'purge-the-foe': {
    quiet: 'border-side-a/60 bg-side-a/10 text-side-a',
    strong: 'border-side-a bg-side-a/25 text-bone',
  },
  disruption: {
    quiet: 'border-side-b/60 bg-side-b/10 text-side-b',
    strong: 'border-side-b bg-side-b/25 text-bone',
  },
  reconnaissance: {
    quiet: 'border-admin/60 bg-admin/10 text-admin',
    strong: 'border-admin bg-admin/25 text-bone',
  },
  'priority-assets': {
    quiet: 'border-discarded/60 bg-discarded/10 text-discarded',
    strong: 'border-discarded bg-discarded/25 text-bone',
  },
}

/** A small outlined tag for a state or rule a list carries; the caller adds its border and text colour. */
export const OUTLINE_TAG = 'shrink-0 rounded-sm border px-1.5 text-2xs leading-5 font-medium whitespace-nowrap'

/** A force disposition as a small caps tag in its own colour, the same colour it wears wherever it is chosen. */
export const dispositionTag = (id: string) => `${OUTLINE_TAG} ${dispositionTone(id)}`

export function dispositionTone(id: string, selected = false) {
  const key = routeSlug(id)
  const tone = dispositionTones[key]
  return tone ? (selected ? tone.strong : tone.quiet) : selected ? 'border-parchment bg-raised text-bone' : 'border-edge bg-sunken text-dim'
}

export function dispositionsFor(
  detachments: readonly { id: string; dispositions: readonly DispositionOption[] }[],
  selectedIds: readonly string[],
) {
  const selected = new Set(selectedIds)
  return [
    ...new Map(
      detachments
        .filter((detachment) => selected.has(detachment.id))
        .flatMap((detachment) => detachment.dispositions.map((option) => [option.id, option])),
    ).values(),
  ]
}

/** A Force disposition any of the faction's detachments offers, by id. */
export const factionDisposition = (
  faction:
    | {
        detachments: readonly { dispositions: readonly DispositionOption[] }[]
        withoutDetachments?: { dispositions: readonly DispositionOption[] }
      }
    | null
    | undefined,
  id: string | null | undefined,
) =>
  [
    ...(faction?.withoutDetachments?.dispositions ?? []),
    ...(faction?.detachments.flatMap((detachment) => detachment.dispositions) ?? []),
  ].find((disposition) => disposition.id === id)

type OfferedDetachment = { id: string; name: string; exclusiveWith?: readonly { id: string; limit: string }[] }

/** Why the catalogue refuses this detachment beside the ones already taken, if it does. */
export function detachmentConflict(detachment: OfferedDetachment, selected: readonly OfferedDetachment[]) {
  for (const other of selected) {
    const shared = detachment.exclusiveWith?.find((entry) => entry.id === other.id)
    if (shared) return `Can't be taken with ${other.name}: only one ${shared.limit} detachment`
  }
  return null
}

export type DetachmentRefusal = { kind: 'count' | 'points' | 'conflict'; reason: string }

/**
 * Why this detachment cannot join the ones already taken at this battle size, if it cannot. A list
 * that swaps its only detachment passes none as taken, since choosing another replaces it.
 */
export function detachmentRefusal(
  detachment: OfferedDetachment & { points?: number | null },
  selected: readonly (OfferedDetachment & { points?: number | null })[],
  limit: number,
  waived: readonly FormatRuleId[] = [],
  /** The battle sizes the list's rules version records. */
  sizes?: readonly BattleSize[],
): DetachmentRefusal | null {
  const most = detachmentLimit(limit, waived)
  if (selected.length >= most) return { kind: 'count', reason: `At most ${countLabel(most, 'detachment')}` }
  // A detachment the army can never add explains that first: waiving detachment points would not let it in.
  const conflict = detachmentConflict(detachment, selected)
  if (conflict) return { kind: 'conflict', reason: conflict }
  const allowance = detachmentPointBudget(limit, sizes)
  if (allowance !== null && detachment.points != null && enforces(waived, 'detachment-points')) {
    const left = allowance - selected.reduce((total, other) => total + (other.points ?? 0), 0)
    if (detachment.points > left)
      return {
        kind: 'points',
        reason: selected.length
          ? `Needs ${detachment.points} DP, ${Math.max(left, 0)} left`
          : `Needs ${detachment.points} DP, ${allowance} at this size`,
      }
  }
  return null
}

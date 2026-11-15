import { detachmentLimit, detachmentPointBudget, enforces, type FormatRuleId } from '../../core/battle'
import { countLabel } from '../text'

type DispositionOption = { id: string; name: string }

/** A Force disposition choice: the name is printed, so hue stays with sides and actions. */
export const dispositionChip = (selected = false) => (selected ? 'border-parchment bg-raised text-bone' : 'border-runner text-dim')

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
  faction: { detachments: readonly { dispositions: readonly DispositionOption[] }[] } | null | undefined,
  id: string | null | undefined,
) => faction?.detachments.flatMap((detachment) => detachment.dispositions).find((disposition) => disposition.id === id)

type OfferedDetachment = { id: string; name: string; exclusiveWith?: readonly { id: string; limit: string }[] }

/** Why the catalogue refuses this detachment beside the ones already taken, if it does. */
export function detachmentConflict(detachment: OfferedDetachment, selected: readonly OfferedDetachment[]) {
  for (const other of selected) {
    const shared = detachment.exclusiveWith?.find((entry) => entry.id === other.id)
    if (shared) return `An army can include only one ${shared.limit} detachment, and this army already has ${other.name}.`
  }
  return null
}

type DetachmentRefusal = { kind: 'count' | 'points' | 'conflict'; reason: string }

/**
 * Why this detachment cannot join the ones already taken at this battle size, if it cannot. A list
 * that swaps its only detachment passes none as taken, since choosing another replaces it.
 */
export function detachmentRefusal(
  detachment: OfferedDetachment & { points?: number | null },
  selected: readonly (OfferedDetachment & { points?: number | null })[],
  limit: number,
  waived: readonly FormatRuleId[] = [],
): DetachmentRefusal | null {
  const most = detachmentLimit(limit, waived)
  if (selected.length >= most) return { kind: 'count', reason: `An army can include at most ${countLabel(most, 'detachment')}.` }
  const allowance = detachmentPointBudget(limit)
  // A lone detachment is never over budget, whatever it costs.
  if (selected.length && allowance !== null && detachment.points != null && enforces(waived, 'detachment-points')) {
    const left = allowance - selected.reduce((total, other) => total + (other.points ?? 0), 0)
    if (detachment.points > left)
      return { kind: 'points', reason: `${detachment.name} costs ${detachment.points} DP, and only ${left} of ${allowance} DP are left.` }
  }
  const conflict = detachmentConflict(detachment, selected)
  return conflict ? { kind: 'conflict', reason: conflict } : null
}

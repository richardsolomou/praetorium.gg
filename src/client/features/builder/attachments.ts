import type { Attachment, AttachmentLimits } from '../../../core/attach'
export { attachmentRows, type AttachmentRow } from '../../../core/attachmentRows'
import { normalizedName } from '../../../core/name'
import type { KeyedPick } from '../../rosterPicks'

/** Only what deciding an attachment needs, so a caller may pass any priced unit. */
type AttachableUnit = {
  name: string
  attachment: Attachment | null
  attachmentLimits?: AttachmentLimits
  attachmentCategories?: readonly string[]
}

/**
 * The units in the list this one may join: named by its own rules, present in the
 * roster, and not already holding it. A unit it is already attached to is not offered
 * again, which is what stops the row and the offer both being on screen.
 *
 * A unit is not offered another Leader or Support once its catalogue limit is
 * reached. `attachmentErrors` remains the legality authority for imported lists.
 */
export function joinableUnits(
  picks: readonly KeyedPick[],
  units: readonly (AttachableUnit | undefined)[],
  index: number,
): { key: number; name: string }[] {
  const pick = picks[index]
  const unit = units[index]
  if (!pick || !unit?.attachment || pick.attachedTo !== undefined) return []

  const kind = unit.attachment.kind
  const wanted = new Set(unit.attachment.targets.map(normalizedName))
  const occupied = new Map<number, number>()
  const occupiedCategories = new Map<number, Map<string, number>>()
  picks.forEach((candidate, at) => {
    if (candidate.attachedTo === undefined) return
    const attached = units[at]
    if (attached?.attachment?.kind === kind) occupied.set(candidate.attachedTo, (occupied.get(candidate.attachedTo) ?? 0) + 1)
    const categories = occupiedCategories.get(candidate.attachedTo) ?? new Map<string, number>()
    for (const category of attached?.attachmentCategories ?? []) {
      categories.set(category, (categories.get(category) ?? 0) + 1)
    }
    occupiedCategories.set(candidate.attachedTo, categories)
  })
  return picks.flatMap((candidate, at) => {
    const host = units[at]
    if (at === index || !host || !wanted.has(normalizedName(host.name))) return []
    const limits = host.attachmentLimits
    if ((occupied.get(candidate.key) ?? 0) >= (limits?.[kind] ?? 1)) return []
    const categoryCounts = occupiedCategories.get(candidate.key)
    const categoryFull = (unit.attachmentCategories ?? []).some((category) => {
      const limit = limits?.categories[category]
      return limit !== undefined && (categoryCounts?.get(category) ?? 0) >= limit.maximum
    })
    return categoryFull ? [] : [{ key: candidate.key, name: host.name }]
  })
}

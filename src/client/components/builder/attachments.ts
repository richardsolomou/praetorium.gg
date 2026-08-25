import { type Attachment, normalizedName } from '../../../core/attach'
export { attachmentRows, type AttachmentRow } from '../../../core/attachmentRows'
import type { KeyedPick } from '../../rosterPicks'

/** Only what deciding an attachment needs, so a caller may pass any priced unit. */
type AttachableUnit = { name: string; attachment: Attachment | null }

/**
 * The units in the list this one may join: named by its own rules, present in the
 * roster, and not already holding it. A unit it is already attached to is not offered
 * again, which is what stops the row and the offer both being on screen.
 *
 * A unit whose Leader or Support place is occupied is not offered another of that
 * kind. `attachmentErrors` remains the legality authority for every imported or
 * edited list; this only keeps a known-illegal offer off the screen.
 */
export function joinableUnits(
  picks: readonly KeyedPick[],
  units: readonly (AttachableUnit | undefined)[],
  index: number,
): { key: number; name: string }[] {
  const pick = picks[index]
  const unit = units[index]
  if (!pick || !unit?.attachment || pick.attachedTo !== undefined) return []

  const wanted = new Set(unit.attachment.targets.map(normalizedName))
  const occupied = new Set(
    picks.flatMap((candidate, at) =>
      candidate.attachedTo !== undefined && units[at]?.attachment?.kind === unit.attachment?.kind ? [candidate.attachedTo] : [],
    ),
  )
  return picks.flatMap((candidate, at) =>
    at !== index && units[at] && wanted.has(normalizedName(units[at]?.name ?? '')) && !occupied.has(candidate.key)
      ? [{ key: candidate.key, name: units[at]?.name ?? '' }]
      : [],
  )
}

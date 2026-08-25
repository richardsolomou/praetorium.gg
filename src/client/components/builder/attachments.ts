import { type Attachment, normalizedName } from '../../../core/attach'
import type { KeyedPick } from '../../rosterPicks'

/** Only what deciding an attachment needs, so a caller may pass any priced unit. */
type AttachableUnit = { name: string; attachment: Attachment | null }

/** One side of an attachment, as the unit's own card states it. */
export type AttachmentRow = {
  label: string
  name: string
  action: string
  /** The pick to detach, which is the unit doing the joining rather than the host. */
  detach: number
}

/**
 * The attachment rows on one unit's card: what it has joined, and what has joined it.
 * Both sides of the same fact, so each card can be read on its own.
 */
export function attachmentRows(
  picks: readonly KeyedPick[],
  units: readonly (AttachableUnit | undefined)[],
  index: number,
): AttachmentRow[] {
  const pick = picks[index]
  const unit = units[index]
  if (!pick || !unit) return []

  const rows: AttachmentRow[] = []
  if (pick.attachedTo !== undefined) {
    const host = units[picks.findIndex((candidate) => candidate.key === pick.attachedTo)]
    if (host) {
      rows.push({
        label: unit.attachment?.kind === 'leader' ? 'Leading' : 'Supporting',
        name: host.name,
        action: 'Remove',
        detach: index,
      })
    }
  }

  for (const [at, candidate] of picks.entries()) {
    const attached = units[at]
    if (candidate.attachedTo !== pick.key || !attached) continue
    rows.push({
      label: attached.attachment?.kind === 'leader' ? 'Leader' : 'Support',
      name: attached.name,
      action: 'Detach',
      detach: at,
    })
  }
  return rows
}

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

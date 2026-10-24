import type { Attachment } from './attach'

type KeyedPick = { key: number; attachedTo?: number }
type AttachableUnit = { name: string; attachment: Attachment | null }

export type AttachmentRow = { label: string; name: string; action: string; detach: number }

/**
 * The words for an attachment, from the joining unit's side and from its host's.
 *
 * Frozen battle rosters keep a joined unit's kind only in these words, so they are data as well as copy.
 */
export const ATTACHMENT_LABELS = {
  leader: { joining: 'Leading', hosting: 'Leader' },
  support: { joining: 'Supporting', hosting: 'Support' },
} as const satisfies Record<Attachment['kind'], { joining: string; hosting: string }>

/** The kind a joining row names, read back from a frozen roster's words. */
export const joiningKind = (label: string): Attachment['kind'] | undefined =>
  label === ATTACHMENT_LABELS.leader.joining ? 'leader' : label === ATTACHMENT_LABELS.support.joining ? 'support' : undefined

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
        label: ATTACHMENT_LABELS[unit.attachment?.kind ?? 'support'].joining,
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
      label: ATTACHMENT_LABELS[attached.attachment?.kind ?? 'support'].hosting,
      name: attached.name,
      action: 'Detach',
      detach: at,
    })
  }
  return rows
}

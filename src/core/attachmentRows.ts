import type { Attachment } from './attach'

type KeyedPick = { key: number; attachedTo?: number }
type AttachableUnit = { name: string; attachment: Attachment | null }

export type AttachmentRow = { label: string; name: string; action: string; detach: number }

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

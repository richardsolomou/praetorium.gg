import { attachmentOptions, type AttachableUnit } from './attachmentOptions'
import { normalizedName } from './name'

type Pick = { key: number; attachedTo?: number }
type Candidate = {
  id: string
  name: string
  attachment?: AttachableUnit['attachment']
  attachmentLimits?: AttachableUnit['attachmentLimits']
  attachmentCategories?: readonly string[]
}

export function pickerRelationships<T extends Candidate>(
  candidates: readonly T[],
  picks: readonly Pick[],
  units: readonly (AttachableUnit | undefined)[],
  relation: { kind: 'leaders' | 'bodyguards'; key: number },
): (T & { relationship: string; attachmentReason: string | null })[] {
  const index = picks.findIndex((pick) => pick.key === relation.key)
  const selected = units[index]
  if (!selected) return []
  return candidates.flatMap((candidate) => {
    if (relation.kind === 'leaders') {
      if (candidate.attachment?.kind !== 'leader') return []
      const options = attachmentOptions(
        [...picks, { key: -1 }],
        [...units, { ...candidate, attachment: candidate.attachment }],
        picks.length,
      )
      const option = options.find((candidateOption) => candidateOption.key === relation.key)
      return option ? [{ ...candidate, relationship: `Compatible leader for ${selected.name}`, attachmentReason: option.reason }] : []
    }
    if (
      selected.attachment?.kind !== 'leader' ||
      !selected.attachment.targets.some((name) => normalizedName(name) === normalizedName(candidate.name))
    )
      return []
    const option = attachmentOptions(
      [...picks, { key: -1 }],
      [...units, { ...candidate, attachment: candidate.attachment ?? null }],
      index,
    ).find((candidateOption) => candidateOption.key === -1)
    return option ? [{ ...candidate, relationship: `Compatible bodyguard for ${selected.name}`, attachmentReason: option.reason }] : []
  })
}

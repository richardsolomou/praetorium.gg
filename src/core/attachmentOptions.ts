import type { Attachment, AttachmentLimits } from './attach'
import { normalizedName } from './name'

export type AttachableUnit = {
  name: string
  attachment: Attachment | null
  attachmentLimits?: AttachmentLimits
  attachmentCategories?: readonly string[]
}

type AttachmentPick = { key: number; attachedTo?: number }

export function attachmentOptions(
  picks: readonly AttachmentPick[],
  units: readonly (AttachableUnit | undefined)[],
  index: number,
): { key: number; name: string; reason: string | null }[] {
  const pick = picks[index]
  const unit = units[index]
  if (!pick || !unit?.attachment) return []
  const attachment = unit.attachment
  const kind = attachment.kind
  const wanted = new Set(attachment.targets.map(normalizedName))
  return picks.flatMap((candidate, at) => {
    const host = units[at]
    if (at === index || !host || !wanted.has(normalizedName(host.name))) return []
    const occupants = picks.flatMap((other, position) => (other.attachedTo === candidate.key ? [units[position]] : []))
    const limits = host.attachmentLimits
    const categoryFull = (unit.attachmentCategories ?? []).flatMap((category) => {
      const limit = limits?.categories[category]
      return limit && occupants.filter((other) => other?.attachmentCategories?.includes(category)).length >= limit.maximum ? [limit] : []
    })[0]
    const reason =
      pick.attachedTo !== undefined
        ? 'Already attached; detach before choosing another bodyguard.'
        : attachment.requiresLeader && !occupants.some((other) => other?.attachment?.kind === 'leader')
          ? 'Requires an attached Leader.'
          : occupants.filter((other) => other?.attachment?.kind === kind).length >= (limits?.[kind] ?? 1)
            ? `${kind === 'leader' ? 'Leader' : 'Support'} limit reached on ${host.name}.`
            : categoryFull
              ? `${categoryFull.name} limit reached on ${host.name}.`
              : null
    return [{ key: candidate.key, name: host.name, reason }]
  })
}

export function joinableUnits(picks: readonly AttachmentPick[], units: readonly (AttachableUnit | undefined)[], index: number) {
  return attachmentOptions(picks, units, index).flatMap(({ key, name, reason }) => (reason ? [] : [{ key, name }]))
}

type Candidate = {
  name: string
  attachment?: Attachment | null
  attachmentLimits?: AttachmentLimits
  attachmentCategories?: readonly string[]
}

const NEW = -1

/** The roster units that may join the unit at `index` now. */
export function rosterJoiners(picks: readonly AttachmentPick[], units: readonly (AttachableUnit | undefined)[], index: number) {
  const host = picks[index]
  if (!host) return []
  return picks.flatMap((pick, at) =>
    attachmentOptions(picks, units, at).some((option) => option.key === host.key && !option.reason)
      ? [{ key: pick.key, name: units[at]!.name }]
      : [],
  )
}

/** Datasheets the unattached unit at `index` could join once one is added. */
export function newHosts<T extends Candidate>(
  candidates: readonly T[],
  picks: readonly AttachmentPick[],
  units: readonly (AttachableUnit | undefined)[],
  index: number,
): T[] {
  if (!units[index]?.attachment || picks[index]?.attachedTo !== undefined) return []
  return candidates.filter((candidate) =>
    attachmentOptions([...picks, { key: NEW }], [...units, { ...candidate, attachment: candidate.attachment ?? null }], index).some(
      ({ key, reason }) => key === NEW && !reason,
    ),
  )
}

/** Datasheets that could join the unit at `index` once added. */
export function newJoiners<T extends Candidate>(
  candidates: readonly T[],
  picks: readonly AttachmentPick[],
  units: readonly (AttachableUnit | undefined)[],
  index: number,
): T[] {
  const host = picks[index]
  if (!host || !units[index]) return []
  return candidates.filter(
    (candidate) =>
      candidate.attachment &&
      attachmentOptions([...picks, { key: NEW }], [...units, { ...candidate, attachment: candidate.attachment }], picks.length).some(
        ({ key, reason }) => key === host.key && !reason,
      ),
  )
}

/** An attach menu's choices, or none when no choice is available now. */
export function availableChoices<T extends object>(choices: T[]): T[] {
  return choices.some((choice) => !('reason' in choice) || !choice.reason) ? choices : []
}

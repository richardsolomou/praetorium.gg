import { type Attachment, type AttachmentParty, type AttachmentRefusal, attachmentRefusals } from './attach'

export type AttachableUnit = AttachmentParty

type AttachmentPick = { key: number; attachedTo?: number }

/** Each unit the one at `index` could join, with why it cannot now; a unit it may never join is left out. */
export function attachmentOptions(
  picks: readonly AttachmentPick[],
  units: readonly (AttachableUnit | undefined)[],
  index: number,
): { key: number; name: string; reason: string | null }[] {
  const pick = picks[index]
  const unit = units[index]
  if (!pick || !unit?.attachment || unit.unattachable) return []
  const joiner = { ...unit, attachment: unit.attachment }
  return picks.flatMap((candidate, at) => {
    const host = units[at]
    if (at === index || !host) return []
    const occupants = picks.flatMap((other, position) => (other.attachedTo === candidate.key && units[position] ? [units[position]] : []))
    const refusals = attachmentRefusals(joiner, host, occupants)
    if (refusals.some((refusal) => refusal.rule === 'host')) return []
    const reason =
      pick.attachedTo !== undefined
        ? 'Already attached; detach before choosing another bodyguard.'
        : optionReason(refusals[0], joiner.attachment.kind, host.name)
    return [{ key: candidate.key, name: host.name, reason }]
  })
}

function optionReason(refusal: AttachmentRefusal<AttachmentParty> | undefined, kind: Attachment['kind'], hostName: string) {
  switch (refusal?.rule) {
    case 'leaderless':
      return 'Requires an attached Leader.'
    case 'full':
      return `${kind === 'leader' ? 'Leader' : 'Support'} limit reached on ${hostName}.`
    case 'category':
      return `${refusal.name} limit reached on ${hostName}.`
    default:
      return null
  }
}

export function joinableUnits(picks: readonly AttachmentPick[], units: readonly (AttachableUnit | undefined)[], index: number) {
  return attachmentOptions(picks, units, index).flatMap(({ key, name, reason }) => (reason ? [] : [{ key, name }]))
}

type Candidate = Omit<AttachmentParty, 'attachment'> & {
  attachment?: Attachment | null
  /** A picker datasheet's own keywords, standing in for the ones it would hold in the list. */
  search?: { keywords: readonly string[] } | null
}

const asParty = <T extends Candidate>(candidate: T): AttachableUnit => ({
  ...candidate,
  attachment: candidate.attachment ?? null,
  keywords: candidate.keywords ?? candidate.search?.keywords,
})

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
    attachmentOptions([...picks, { key: NEW }], [...units, asParty(candidate)], index).some(({ key, reason }) => key === NEW && !reason),
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
      attachmentOptions([...picks, { key: NEW }], [...units, asParty(candidate)], picks.length).some(
        ({ key, reason }) => key === host.key && !reason,
      ),
  )
}

/** An attach menu's choices, or none when no choice is available now. */
export function availableChoices<T extends object>(choices: T[]): T[] {
  return choices.some((choice) => !('reason' in choice) || !choice.reason) ? choices : []
}

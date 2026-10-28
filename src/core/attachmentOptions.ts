import { type Attachment, type AttachmentParty, type AttachmentRefusal, attachmentRefusals } from './attach'

export type AttachableUnit = AttachmentParty

type AttachmentPick = { key: number; attachedTo?: number }
type Units = readonly (AttachableUnit | undefined)[]

/** The units attached to each pick, by the pick's key, which every attach judgement counts against its host's limits. */
export function occupantsByHost(picks: readonly AttachmentPick[], units: Units) {
  const occupants = new Map<number, AttachableUnit[]>()
  picks.forEach((pick, position) => {
    const unit = units[position]
    if (pick.attachedTo === undefined || !unit) return
    occupants.set(pick.attachedTo, [...(occupants.get(pick.attachedTo) ?? []), unit])
  })
  return occupants
}

const asJoiner = (unit: AttachableUnit | undefined) =>
  unit?.attachment && !unit.unattachable ? { ...unit, attachment: unit.attachment } : null

/** Why `joiner` cannot join `host` now, null when it can, or undefined when it may never join it. */
function joinReason(
  pick: AttachmentPick,
  joiner: NonNullable<ReturnType<typeof asJoiner>>,
  host: AttachableUnit,
  occupants: readonly AttachableUnit[],
) {
  const refusals = attachmentRefusals(joiner, host, occupants)
  if (refusals.some((refusal) => refusal.rule === 'host')) return undefined
  return pick.attachedTo !== undefined
    ? 'Already attached; detach before choosing another bodyguard.'
    : optionReason(refusals[0], joiner.attachment.kind, host.name)
}

/** Each unit the one at `index` could join, with why it cannot now; a unit it may never join is left out. */
export function attachmentOptions(
  picks: readonly AttachmentPick[],
  units: Units,
  index: number,
  occupants = occupantsByHost(picks, units),
): { key: number; name: string; reason: string | null }[] {
  const pick = picks[index]
  const joiner = asJoiner(units[index])
  if (!pick || !joiner) return []
  return picks.flatMap((candidate, at) => {
    const host = units[at]
    if (at === index || !host) return []
    const reason = joinReason(pick, joiner, host, occupants.get(candidate.key) ?? [])
    return reason === undefined ? [] : [{ key: candidate.key, name: host.name, reason }]
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

export function joinableUnits(picks: readonly AttachmentPick[], units: Units, index: number, occupants = occupantsByHost(picks, units)) {
  return attachmentOptions(picks, units, index, occupants).flatMap(({ key, name, reason }) => (reason ? [] : [{ key, name }]))
}

type Candidate = Omit<AttachmentParty, 'attachment'> & {
  attachment?: Attachment | null
  /** A picker datasheet's keywords, with those its detachments grant, standing in for the ones it would hold in the list. */
  search?: { keywords: readonly string[] } | null
}

const asParty = <T extends Candidate>(candidate: T): AttachableUnit => ({
  ...candidate,
  attachment: candidate.attachment ?? null,
  keywords: candidate.keywords ?? candidate.search?.keywords,
})

const NEW = { key: -1 }

/** The roster units that may join the unit at `index` now. */
export function rosterJoiners(picks: readonly AttachmentPick[], units: Units, index: number, occupants = occupantsByHost(picks, units)) {
  const host = picks[index]
  const hostUnit = units[index]
  if (!host || !hostUnit) return []
  return picks.flatMap((pick, at) => {
    const joiner = at === index ? null : asJoiner(units[at])
    return joiner && joinReason(pick, joiner, hostUnit, occupants.get(host.key) ?? []) === null
      ? [{ key: pick.key, name: joiner.name }]
      : []
  })
}

/** Datasheets the unattached unit at `index` could join once one is added. */
export function newHosts<T extends Candidate>(
  candidates: readonly T[],
  picks: readonly AttachmentPick[],
  units: Units,
  index: number,
): T[] {
  const pick = picks[index]
  const joiner = asJoiner(units[index])
  if (!pick || !joiner || pick.attachedTo !== undefined) return []
  return candidates.filter((candidate) => joinReason(pick, joiner, asParty(candidate), []) === null)
}

/** Datasheets that could join the unit at `index` once added. */
export function newJoiners<T extends Candidate>(
  candidates: readonly T[],
  picks: readonly AttachmentPick[],
  units: Units,
  index: number,
  occupants = occupantsByHost(picks, units),
): T[] {
  const host = picks[index]
  const hostUnit = units[index]
  if (!host || !hostUnit) return []
  return candidates.filter((candidate) => {
    const joiner = asJoiner(asParty(candidate))
    return joiner && joinReason(NEW, joiner, hostUnit, occupants.get(host.key) ?? []) === null
  })
}

/** An attach menu's choices, or none when no choice is available now. */
export function availableChoices<T extends object>(choices: T[]): T[] {
  return choices.some((choice) => !('reason' in choice) || !choice.reason) ? choices : []
}

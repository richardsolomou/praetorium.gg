import { detachmentIds } from './savedRoster'

export const LOCKED_ROSTER_MESSAGE = 'This roster is locked. Unlock it to change it, or keep your changes as a new roster.'

/** Everything a save can change on a roster apart from who can read it. */
export type RosterContent = {
  name: string
  automaticName: boolean
  catalogueId: string
  detachmentIds: readonly string[]
  disposition: string | null | undefined
  limit: number
  picks: unknown
  prep: unknown
  waivedRules?: readonly string[]
  optionalRules?: readonly string[]
  borrowedDetachmentId?: string | null
}

/** The content of a stored row, whose structured fields are JSON. */
export function storedRosterContent(row: {
  name: string
  automaticName?: boolean | null
  catalogueId: string
  detachmentId?: string | null
  disposition?: string | null
  limit: number
  picks: string
  prep?: string | null
  waivedRules: string
  optionalRules?: string | null
  borrowedDetachmentId?: string | null
}): RosterContent {
  return {
    name: row.name,
    automaticName: row.automaticName ?? !row.name,
    catalogueId: row.catalogueId,
    detachmentIds: detachmentIds(row.detachmentId),
    disposition: row.disposition,
    limit: row.limit,
    picks: JSON.parse(row.picks),
    prep: row.prep ? JSON.parse(row.prep) : null,
    waivedRules: JSON.parse(row.waivedRules) as string[],
    optionalRules: row.optionalRules ? (JSON.parse(row.optionalRules) as string[]) : [],
    borrowedDetachmentId: row.borrowedDetachmentId,
  }
}

/**
 * Why a save may not replace a locked roster's content, or null when it may.
 *
 * A save that leaves the content as it is still applies, so a visibility change
 * travelling as a whole-roster save is not refused. An automatic name is derived
 * from the units, so it is not content of its own.
 */
export function lockedRosterRefusal(current: (RosterContent & { locked?: boolean | null }) | null | undefined, next: RosterContent) {
  if (!current?.locked) return null
  return comparable(current) === comparable(next) ? null : LOCKED_ROSTER_MESSAGE
}

/** Rows saved while unit nicknames and shared notes existed still carry them, and a save no longer sends either. */
const withoutRetiredPick = (pick: unknown) => {
  if (!pick || typeof pick !== 'object') return pick
  const { nickname: _nickname, ...rest } = pick as Record<string, unknown>
  return rest
}

function comparable(content: RosterContent) {
  const { shareNotes: _shareNotes, ...prep } =
    content.prep && typeof content.prep === 'object' ? (content.prep as Record<string, unknown>) : {}
  return canonical({
    name: content.automaticName ? '' : content.name,
    automaticName: content.automaticName,
    catalogueId: content.catalogueId,
    detachmentIds: content.detachmentIds,
    disposition: content.disposition ?? null,
    limit: content.limit,
    picks: Array.isArray(content.picks) ? content.picks.map(withoutRetiredPick) : content.picks,
    prep: {
      ...prep,
      stratagems: prep.stratagems ?? [],
      secondaries: prep.secondaries ?? [],
      reminders: prep.reminders ?? [],
      remindersEnabled: prep.remindersEnabled ?? true,
    },
    waivedRules: content.waivedRules ?? [],
    optionalRules: content.optionalRules ?? [],
    borrowedDetachmentId: content.borrowedDetachmentId ?? null,
  })
}

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, field: unknown) =>
    field && typeof field === 'object' && !Array.isArray(field)
      ? Object.fromEntries(Object.entries(field).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)))
      : field,
  )
}

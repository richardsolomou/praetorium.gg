import type { TableShape } from './tableShape'
import type { FormatRuleId, Roster } from './battle'
import type { RosterPick } from './roster'
import type { RosterReminder } from './reminders'

export const LEAGUE_VISIBILITIES = ['public', 'private'] as const
export type LeagueVisibility = (typeof LEAGUE_VISIBILITIES)[number]

export const LEAGUE_ADMISSIONS = ['automatic', 'approval'] as const
export type LeagueAdmission = (typeof LEAGUE_ADMISSIONS)[number]

export const LEAGUE_ENTRY_STATUSES = ['pending', 'accepted', 'rejected'] as const
export type LeagueEntryStatus = (typeof LEAGUE_ENTRY_STATUSES)[number]

export const LEAGUE_DEFAULT_ROSTER_LIMIT = 2_000
export const LEAGUE_TEAM_ROSTER_LIMITS = [2_000] as const

export function leagueTableShape(format: TableShape | null | undefined): TableShape {
  return format ?? '1v1'
}

export function alliedLeagueRosterLimit(rosterLimit: number) {
  return rosterLimit / 2
}

/**
 * How a shape splits an event's roster size between the players on a side.
 *
 * A 1v1 splits nothing, so it has no phrasing here and each surface prints the size in
 * whatever density it has room for.
 */
export function leagueRosterSplit(format: TableShape, rosterLimit: number) {
  if (format === '2v1') return `${rosterLimit.toLocaleString()} solo / ${alliedLeagueRosterLimit(rosterLimit).toLocaleString()} allied`
  if (format === '2v2') return `${rosterLimit.toLocaleString()} per force / ${alliedLeagueRosterLimit(rosterLimit).toLocaleString()} each`
  return null
}

export function requiredLeagueRosterLimit(
  format: TableShape | null,
  eventLimit: number | null,
  entryAssignment: number | null,
  teamId: string | null = null,
) {
  if (format === '1v1') return eventLimit
  if (format === '2v1') return entryAssignment
  if (format === '2v2') return teamId === null || eventLimit === null ? null : alliedLeagueRosterLimit(eventLimit)
  return null
}

export const LEAGUE_NAME_MAX_LENGTH = 100
export const LEAGUE_DESCRIPTION_MAX_LENGTH = 2_000
export const LEAGUE_MEMBER_MAX = 128
export const LEAGUE_MEMBER_MIN = 2

export type LeagueEntryView = {
  userId: string
  name: string
  image: string | null
  status: LeagueEntryStatus
  joinedAt: number
  submitted: boolean
  rosterName: string | null
  requiredLimit: number | null
  sealedLimit: number | null
  teamId: string | null
}

/** The fewest places each table shape can seat. */
export const LEAGUE_SHAPE_PLACES: Record<TableShape, number> = { '1v1': 2, '2v1': 3, '2v2': 4 }

/** The lowest player limit an event of this shape can have, never below its accepted entrants and even for doubles, whose teams are pairs. */
export function leagueMinimumPlaces(format: TableShape | null, accepted = 0) {
  const shape = leagueTableShape(format)
  const needed = Math.max(LEAGUE_SHAPE_PLACES[shape], accepted)
  return shape === '2v2' ? Math.ceil(needed / 2) * 2 : needed
}

/** Whether a player limit can seat an event of this shape; no limit seats any. */
export function leaguePlacesSeat(format: TableShape | null, playerLimit: number | null, accepted = 0) {
  if (playerLimit === null) return true
  return playerLimit >= leagueMinimumPlaces(format, accepted) && (leagueTableShape(format) !== '2v2' || playerLimit % 2 === 0)
}

/** Whether an open event has room for another request, as the join command decides it. */
export function leagueRegistrationFull(
  league: { admission: LeagueAdmission; playerLimit: number | null },
  acceptedCount: number,
  occupiedCount: number,
  memberLimit: number = LEAGUE_MEMBER_MAX,
) {
  return league.admission === 'approval' && league.playerLimit !== null
    ? acceptedCount >= league.playerLimit || occupiedCount >= memberLimit
    : occupiedCount >= (league.playerLimit ?? memberLimit)
}

/** The facts about an entry that reveal readiness reads; `requiredLimit` is the organizer's 2v1 assignment. */
export type LeagueRevealEntry = {
  userId: string
  status: LeagueEntryStatus
  submitted: boolean
  requiredLimit: number | null
  teamId: string | null
}

/**
 * Every structural condition an event's shape puts on reveal, each with the entrants still holding it up.
 *
 * The reveal command refuses unless every check is done, and the organizer reads the same checks as a
 * list. The command still inspects the sealed rosters themselves, so a done list can meet a Warlord refusal.
 */
export type LeagueRevealCheck =
  | { step: 'places'; done: boolean; accepted: number; required: number | null }
  | { step: 'requests'; done: boolean; waiting: string[] }
  | { step: 'sizes'; done: boolean; waiting: string[]; solo: number; allied: number }
  | { step: 'teams'; done: boolean; waiting: string[] }
  | { step: 'lists'; done: boolean; waiting: string[] }

export function leagueRevealChecklist(
  event: { format: TableShape | null; rosterLimit: number | null; playerLimit: number | null },
  entries: readonly LeagueRevealEntry[],
): LeagueRevealCheck[] {
  const accepted = entries.filter((entry) => entry.status === 'accepted')
  const checks: LeagueRevealCheck[] = [
    {
      step: 'places',
      done: accepted.length > 0 && (event.playerLimit === null || accepted.length === event.playerLimit),
      accepted: accepted.length,
      required: event.playerLimit,
    },
  ]
  if (event.format === '2v2') {
    const pending = entries.filter((entry) => entry.status === 'pending').map((entry) => entry.userId)
    checks.push({ step: 'requests', done: pending.length === 0, waiting: pending })
    const teamSizes = new Map<string, number>()
    for (const entry of accepted) if (entry.teamId) teamSizes.set(entry.teamId, (teamSizes.get(entry.teamId) ?? 0) + 1)
    const unpaired = accepted.filter((entry) => !entry.teamId || teamSizes.get(entry.teamId) !== 2).map((entry) => entry.userId)
    checks.push({ step: 'teams', done: accepted.length >= 4 && unpaired.length === 0, waiting: unpaired })
  }
  if (event.format === '2v1') {
    const alliedLimit = alliedLeagueRosterLimit(event.rosterLimit ?? 0)
    const solo = accepted.filter((entry) => entry.requiredLimit !== null && entry.requiredLimit === event.rosterLimit).length
    const allied = accepted.filter((entry) => entry.requiredLimit !== null && entry.requiredLimit === alliedLimit).length
    const unsized = accepted.filter((entry) => entry.requiredLimit === null).map((entry) => entry.userId)
    checks.push({ step: 'sizes', done: unsized.length === 0 && solo > 0 && allied >= 2, waiting: unsized, solo, allied })
  }
  const unsealed = accepted.filter((entry) => !entry.submitted).map((entry) => entry.userId)
  checks.push({ step: 'lists', done: unsealed.length === 0, waiting: unsealed })
  return checks
}

export function visibleLeagueEntries(entries: readonly LeagueEntryView[], ownerId: string, viewerId: string | null) {
  return entries.filter((entry) => entry.status === 'accepted' || viewerId === ownerId || entry.userId === viewerId)
}

export function matchesSealedLeagueRoster(
  saved: {
    name: string
    catalogueId: string
    detachmentIds: readonly string[]
    disposition: string | null
    limit: number
    picks: readonly RosterPick[]
    waivedRules: readonly FormatRuleId[]
    reminders?: readonly RosterReminder[]
    remindersEnabled?: boolean
  },
  sealed: Roster,
) {
  const built = sealed.built
  return (
    !!built?.picks &&
    (!saved.name || saved.name === sealed.name) &&
    saved.catalogueId === built.catalogueId &&
    saved.limit === built.limit &&
    saved.disposition === built.disposition &&
    JSON.stringify(saved.detachmentIds) === JSON.stringify(built.detachmentIds ?? []) &&
    JSON.stringify(saved.picks) === JSON.stringify(built.picks) &&
    JSON.stringify(saved.waivedRules) === JSON.stringify(built.waivedRules ?? []) &&
    JSON.stringify(saved.reminders ?? []) === JSON.stringify(sealed.reminders ?? []) &&
    (saved.remindersEnabled ?? true) === (sealed.remindersEnabled ?? true)
  )
}

/** The two facts about an entry that decide whether its reader is on the same side of the table. */
export type LeagueAllyEntry = {
  userId: string
  status: LeagueEntryStatus
  requiredLimit: number | null
  teamId: string | null
}

/** Before reveal, doubles teammates and 2v1 allies may read each other’s sealed rosters; solo and 1v1 entrants cannot. */
export function readsAlliedLeagueRoster(
  format: TableShape | null,
  eventLimit: number | null,
  reader: LeagueAllyEntry | null,
  sealed: LeagueAllyEntry,
) {
  if (!reader || reader.userId === sealed.userId) return false
  if (reader.status !== 'accepted' || sealed.status !== 'accepted') return false
  if (format === '2v2') return reader.teamId !== null && reader.teamId === sealed.teamId
  if (format === '2v1') {
    if (eventLimit === null) return false
    const allied = alliedLeagueRosterLimit(eventLimit)
    return reader.requiredLimit === allied && sealed.requiredLimit === allied
  }
  return false
}

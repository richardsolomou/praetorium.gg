import type { TableShape } from './tableShape'

export const LEAGUE_VISIBILITIES = ['public', 'private'] as const
export type LeagueVisibility = (typeof LEAGUE_VISIBILITIES)[number]

export const LEAGUE_ADMISSIONS = ['automatic', 'approval'] as const
export type LeagueAdmission = (typeof LEAGUE_ADMISSIONS)[number]

export const LEAGUE_ENTRY_STATUSES = ['pending', 'accepted', 'rejected'] as const
export type LeagueEntryStatus = (typeof LEAGUE_ENTRY_STATUSES)[number]

export const LEAGUE_DEFAULT_ROSTER_LIMIT = 2_000
export const LEAGUE_TEAM_ROSTER_LIMITS = [2_000] as const

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
  teamId: string | null
}

export function visibleLeagueEntries(entries: readonly LeagueEntryView[], ownerId: string, viewerId: string | null) {
  return entries.filter((entry) => entry.status === 'accepted' || viewerId === ownerId || entry.userId === viewerId)
}

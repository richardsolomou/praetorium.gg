export const LEAGUE_VISIBILITIES = ['public', 'private'] as const
export type LeagueVisibility = (typeof LEAGUE_VISIBILITIES)[number]

export const LEAGUE_ADMISSIONS = ['automatic', 'approval'] as const
export type LeagueAdmission = (typeof LEAGUE_ADMISSIONS)[number]

export const LEAGUE_ENTRY_STATUSES = ['pending', 'accepted', 'rejected'] as const
export type LeagueEntryStatus = (typeof LEAGUE_ENTRY_STATUSES)[number]

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
}

export function visibleLeagueEntries(entries: readonly LeagueEntryView[], ownerId: string, viewerId: string | null) {
  return entries.filter((entry) => entry.status === 'accepted' || viewerId === ownerId || entry.userId === viewerId)
}

export const ROSTER_VISIBILITIES = ['private', 'unlisted'] as const
export type RosterVisibility = (typeof ROSTER_VISIBILITIES)[number]

export const ROSTER_SOURCES = ['legacy', 'editable', 'battlebase', 'newrecruit', 'roster-file'] as const
export type RosterSource = (typeof ROSTER_SOURCES)[number]

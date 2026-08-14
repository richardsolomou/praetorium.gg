export const ROSTER_VISIBILITIES = ['private', 'unlisted'] as const
export type RosterVisibility = (typeof ROSTER_VISIBILITIES)[number]

export const ROSTER_SOURCES = ['legacy', 'editable', 'battlebase', 'roster-file'] as const
export type RosterSource = (typeof ROSTER_SOURCES)[number]
export const ROSTER_SOURCE_LABELS: Record<RosterSource, string> = {
  legacy: 'Imported roster',
  editable: 'Praetorium roster',
  battlebase: 'BattleBase import',
  'roster-file': 'Roster file import',
}

export const ROSTER_TAGS_MAX = 8
export const ROSTER_TAG_MAX_LENGTH = 32

export const ROSTER_VISIBILITIES = ['private', 'unlisted', 'public'] as const
export type RosterVisibility = (typeof ROSTER_VISIBILITIES)[number]

export const ROSTER_SOURCES = ['legacy', 'editable', 'praetorium', 'battlebase', 'newrecruit', 'roster-file'] as const
export type RosterSource = (typeof ROSTER_SOURCES)[number]

/** Saved detachments are a JSON array; rows from before multiple detachments hold one bare id. */
export function detachmentIds(value: string | null | undefined): string[] {
  if (!value) return []
  if (!value.startsWith('[')) return [value]
  const parsed: unknown = JSON.parse(value)
  return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
}

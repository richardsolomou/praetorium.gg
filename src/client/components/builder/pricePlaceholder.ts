import type { RosterPick } from '../../../core/roster'

export function preservesUnitSequence(previous: unknown, current: readonly RosterPick[]) {
  if (!Array.isArray(previous) || previous.length > current.length) return false
  return previous.every(
    (pick, index) =>
      typeof pick === 'object' &&
      pick !== null &&
      'entryId' in pick &&
      'catalogueId' in pick &&
      pick.entryId === current[index]?.entryId &&
      pick.catalogueId === current[index]?.catalogueId,
  )
}

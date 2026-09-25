import type { RosterPick } from '../../../../core/roster'

const samePick = (previous: unknown, current: RosterPick | undefined) =>
  typeof previous === 'object' &&
  previous !== null &&
  'entryId' in previous &&
  'catalogueId' in previous &&
  previous.entryId === current?.entryId &&
  previous.catalogueId === current?.catalogueId

/** Keep only the leading run of old priced units that still matches the draft; later cards may describe different picks and wait for repricing. */
export function survivingUnits(previous: unknown, current: readonly RosterPick[]): number[] | null {
  if (!Array.isArray(previous)) return null
  const kept: number[] = []
  let at = 0
  for (const pick of current) {
    while (at < previous.length && !samePick(previous[at], pick)) at++
    if (at >= previous.length) break
    kept.push(at)
    at++
  }
  return kept
}

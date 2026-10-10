import { hashKey } from '@tanstack/react-query'
import type { RosterPick } from '../../../../core/roster'

export const samePriceContext = (previous: readonly unknown[] | undefined, current: readonly unknown[]) =>
  previous !== undefined && hashKey(previous.slice(0, -1)) === hashKey(current.slice(0, -1))

const samePick = (previous: unknown, current: RosterPick | undefined) =>
  typeof previous === 'object' &&
  previous !== null &&
  'entryId' in previous &&
  previous.entryId === current?.entryId &&
  ('catalogueId' in previous ? previous.catalogueId : undefined) === current?.catalogueId

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

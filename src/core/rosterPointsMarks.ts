import { z } from 'zod'
import { remember } from './collections'

/**
 * A saved list's total as one army-data revision priced it, which is how a later revision tells
 * whether its own update changed that total. A mark only speaks for the list as it was saved
 * at `updatedAt`: after the player edits it, the old total says nothing about the update.
 */
export type RosterPointsMark = { rosterId: string; userId: string; updatedAt: number; points: number }
export type StoredRosterPointsMark = RosterPointsMark & { revision: string }

/** The most marks one transaction stores. */
export const ROSTER_POINTS_MARKS_MAX = 5_000

export const rosterPointsMarksSchema = z
  .array(
    z.object({
      rosterId: z.string().min(1).max(200),
      userId: z.string().min(1).max(200),
      updatedAt: z.number().int().nonnegative(),
      points: z.number().int().nonnegative().max(1_000_000),
    }),
  )
  .max(ROSTER_POINTS_MARKS_MAX)

export type RosterPointsChange = { id: string; name: string; from: number; to: number }

/**
 * Each player's lists whose total changed with nothing but the army data: the list is unchanged
 * since a different revision priced it, and the price now differs.
 */
export function rosterPointsChanges(
  previous: readonly StoredRosterPointsMark[],
  current: readonly (RosterPointsMark & { name: string })[],
  revision: string,
) {
  const before = new Map(previous.map((mark) => [mark.rosterId, mark]))
  const changes = new Map<string, RosterPointsChange[]>()
  for (const mark of current) {
    const old = before.get(mark.rosterId)
    if (!old || old.revision === revision || old.userId !== mark.userId || old.updatedAt !== mark.updatedAt) continue
    if (old.points === mark.points) continue
    remember(changes, mark.userId, () => []).push({ id: mark.rosterId, name: mark.name, from: old.points, to: mark.points })
  }
  return changes
}

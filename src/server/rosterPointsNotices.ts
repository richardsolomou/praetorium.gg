import { chunks } from '../core/collections'
import { ROSTER_POINTS_MARKS_MAX, rosterPointsChanges } from '../core/rosterPointsMarks'
import { NAMED_ROSTERS, type Notice } from '../core/notifications'
import { app } from './app'
import type { Notifier } from './pushNotifier'
import { rosterFromRow } from './rosterPersistence'
import { cachedRosterAssessmentsFor } from './rosterPrices'
import type { SpacetimeRepository } from './spacetimeRepository'

/** `push_targets` reads at most this many recipients at once. */
const PLAYERS_PER_PAGE = 100

/**
 * Tells each player a notice can reach which of their active lists the current army data repriced.
 *
 * A data update arrives with a new server as often as with a sync, so the totals it is compared with are
 * stored rather than held: each run records the totals this revision gives, and a run on a later revision
 * compares with them. Replacing the record and reading the old one is one transaction, so a restart or
 * a second run on the same revision finds nothing left to say.
 */
export async function noticeRosterPointsChanges(
  repository: Pick<SpacetimeRepository, 'pushRosters' | 'replaceRosterPointsMarks'>,
  notifier: Notifier,
) {
  const revision = (await app().factionIndexFor())?.revision
  if (!revision) return
  let after: string | null = ''
  while (after !== null) {
    const page = await repository.pushRosters(after, PLAYERS_PER_PAGE)
    const rosters = page.rosters.map((row) => ({ ...rosterFromRow(row), userId: row.userId }))
    const assessments = await cachedRosterAssessmentsFor(rosters)
    const priced = rosters.flatMap((roster, index) => {
      const { points } = assessments[index]!
      if (points === null) return []
      return [{ rosterId: roster.id, userId: roster.userId, updatedAt: roster.updatedAt, points, name: roster.name || 'Unnamed roster' }]
    })
    const previous = []
    for (const part of chunks(priced, ROSTER_POINTS_MARKS_MAX))
      previous.push(
        ...(await repository.replaceRosterPointsMarks(
          revision,
          part.map(({ name: _name, ...mark }) => mark),
        )),
      )
    notifier.notify(
      [...rosterPointsChanges(previous, priced, revision)].map(([userId, changed]): Notice => ({
        kind: 'roster-points-changed',
        // No player caused it, so no recipient is left out as its sender.
        actorId: '',
        recipientIds: [userId],
        rosters: changed.slice(0, NAMED_ROSTERS),
        count: changed.length,
      })),
    )
    after = page.next
  }
}

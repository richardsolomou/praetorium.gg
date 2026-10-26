import type { QueryClient } from '@tanstack/react-query'
import { ROSTER_LIBRARY_BATCH_SIZE } from '../../core/rosterLibrary'
import { savedRosterPageQuery, rosterAccessQuery } from '../queries/rosters'
import type { savedRosterSummaries } from '../functions'
import { sortRosters } from '../../core/rosterSort'
import { localDocument, type LocalRoster } from './localRuntime'
import { nextTask } from '../../shared/nextTask'
import { chunks } from '../../core/collections'

export async function prepareRosters(
  client: QueryClient,
  summaries: Awaited<ReturnType<typeof savedRosterSummaries>>,
  current: () => boolean,
) {
  const rosters = sortRosters(summaries, 'updated-desc')
  for (const batch of chunks(rosters, ROSTER_LIBRARY_BATCH_SIZE)) {
    await nextTask()
    if (!current()) return
    await client
      .query({
        ...savedRosterPageQuery(batch.map((roster) => roster.id)),
        staleTime: Infinity,
      })
      .catch(() => {})
  }
  for (const roster of rosters) {
    await nextTask()
    if (!current()) return
    const saved = await localDocument<LocalRoster | null>(`roster:${roster.id}`)
    if (!current()) return
    if (saved && saved.updatedAt >= roster.updatedAt) continue
    await client.query({ ...rosterAccessQuery(roster.id), staleTime: 0 }).catch(() => {})
  }
}

import type { QueryClient } from '@tanstack/react-query'
import { ROSTER_LIBRARY_BATCH_SIZE } from '../../core/rosterLibrary'
import { savedRosterPageQuery, rosterAccessQuery } from '../queries/rosters'
import type { savedRosterSummaries } from '../functions'
import { sortRosters } from '../../core/rosterSort'
import { localDocument, type LocalRoster } from './localRuntime'

export async function prepareRosters(
  client: QueryClient,
  summaries: Awaited<ReturnType<typeof savedRosterSummaries>>,
  current: () => boolean,
) {
  const rosters = sortRosters(summaries, 'updated-desc')
  for (let index = 0; index < rosters.length; index += ROSTER_LIBRARY_BATCH_SIZE) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    if (!current()) return
    await client
      .query({
        ...savedRosterPageQuery(rosters.slice(index, index + ROSTER_LIBRARY_BATCH_SIZE).map((roster) => roster.id)),
        staleTime: Infinity,
      })
      .catch(() => {})
  }
  for (const roster of rosters) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    if (!current()) return
    const saved = await localDocument<LocalRoster | null>(`roster:${roster.id}`)
    if (!current()) return
    if (saved && saved.updatedAt >= roster.updatedAt) continue
    await client.query({ ...rosterAccessQuery(roster.id), staleTime: 0 }).catch(() => {})
  }
}

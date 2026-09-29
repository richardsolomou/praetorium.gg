import { useQueries } from '@tanstack/react-query'
import { ROSTER_LIBRARY_BATCH_SIZE } from '../../../core/rosterLibrary'
import { savedRosterPageQuery } from '../../queries'

/**
 * Points, legality, labels and variant differences for the lists on screen, asked for
 * in the same bounded batches the server prices them in.
 */
export function useRosterPages(ids: readonly string[], enabled: boolean) {
  const batches = Array.from({ length: Math.ceil(ids.length / ROSTER_LIBRARY_BATCH_SIZE) }, (_, index) =>
    ids.slice(index * ROSTER_LIBRARY_BATCH_SIZE, (index + 1) * ROSTER_LIBRARY_BATCH_SIZE),
  )
  const results = useQueries({ queries: batches.map((batch) => ({ ...savedRosterPageQuery(batch), enabled })) })
  const byId = new Map(results.flatMap((result) => result.data ?? []).map((entry) => [entry.id, entry]))
  return {
    results,
    byId,
    /** Whether the batch holding the list at this position is still being priced. */
    pending: (index: number) => results[Math.floor(index / ROSTER_LIBRARY_BATCH_SIZE)]?.isPending ?? false,
  }
}

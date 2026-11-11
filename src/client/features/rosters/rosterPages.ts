import { useQueries } from '@tanstack/react-query'
import { savedRosterPageQuery } from '../../queries'

/**
 * Points, legality, labels and variant differences for these lists, each cached on its own so a new sort or filter
 * asks only for lists not already assessed.
 */
export function useRosterPages(ids: readonly string[], enabled: boolean) {
  const results = useQueries({ queries: ids.map((id) => ({ ...savedRosterPageQuery(id), enabled })) })
  return {
    results,
    byId: new Map(results.flatMap((result) => (result.data ? [[result.data.id, result.data] as const] : []))),
    /** Whether the list at this position is still being priced. */
    pending: (index: number) => results[index]?.isPending ?? false,
  }
}

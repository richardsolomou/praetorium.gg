import { InfiniteQueryObserver, QueryClient } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as functions from '../../server/functions'
import { discoveredRostersQuery, playedArmiesQuery } from './rosters'

afterEach(() => vi.restoreAllMocks())

type Cursor = { at: number; id: string } | null
type Options = ReturnType<typeof discoveredRostersQuery> | ReturnType<typeof playedArmiesQuery>

function rejectsMissingPages(
  name: string,
  options: () => Options,
  request: 'discoverRosters' | 'discoverPlayedArmies',
  page: (nextCursor: Cursor) => unknown,
) {
  describe(`${name} pages`, () => {
    it('rejects a missing first page instead of caching it', async () => {
      const client = new QueryClient()
      vi.spyOn(functions, request).mockResolvedValue(undefined as never)
      try {
        await expect(client.infiniteQuery(options() as never)).rejects.toThrow('returned no page.')
        expect(client.getQueryData(options().queryKey)).toBeUndefined()
      } finally {
        client.clear()
      }
    })

    it('keeps earlier pages when a refetch or the next page returns no page', async () => {
      const client = new QueryClient()
      vi.spyOn(functions, request)
        .mockResolvedValueOnce(page({ at: 1, id: 'last' }) as never)
        .mockResolvedValue(undefined as never)
      try {
        const previous = await client.infiniteQuery(options() as never)
        await expect(client.infiniteQuery({ ...options(), staleTime: 0 } as never)).rejects.toThrow('returned no page.')
        const observer = new InfiniteQueryObserver(client, options() as never)
        await expect(observer.fetchNextPage({ throwOnError: true })).rejects.toThrow('returned no page.')
        expect(client.getQueryData(options().queryKey)).toBe(previous)
      } finally {
        client.clear()
      }
    })
  })
}

rejectsMissingPages(
  'discovered rosters',
  () => discoveredRostersQuery({}, 'friends', 'updated-desc'),
  'discoverRosters',
  (nextCursor) => ({
    rosters: [],
    total: 0,
    nextCursor,
  }),
)
rejectsMissingPages(
  'played armies',
  () => playedArmiesQuery({}),
  'discoverPlayedArmies',
  (nextCursor) => ({ armies: [], nextCursor }),
)

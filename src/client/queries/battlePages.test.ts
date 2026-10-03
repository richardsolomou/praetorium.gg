import { InfiniteQueryObserver, QueryClient } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as functions from '../../server/functions'
import { battlesFrom, battlesQuery, friendBattlesQuery, publicBattlesQuery } from './battles'
import { leagueBattlesFrom, leagueBattlesQuery } from './leagues'

afterEach(() => vi.restoreAllMocks())

describe.each([
  { name: 'own battles', options: battlesQuery, request: 'myBattles' as const, rows: battlesFrom },
  { name: 'public battles', options: publicBattlesQuery, request: 'publicBattles' as const, rows: battlesFrom },
  { name: 'friend battles', options: friendBattlesQuery, request: 'friendBattles' as const, rows: battlesFrom },
  {
    name: 'league battles',
    options: () => leagueBattlesQuery('league', 'event'),
    request: 'listLeagueBattles' as const,
    rows: leagueBattlesFrom,
  },
])('$name pages', ({ options, request, rows }) => {
  it.each([undefined, null])('rejects a %s first page instead of caching it as a successful feed', async (missing) => {
    const client = new QueryClient()
    vi.spyOn(functions, request).mockResolvedValue(missing as never)
    try {
      await expect(client.infiniteQuery(options())).rejects.toThrow('The battle feed returned no page.')
      expect(client.getQueryData(options().queryKey)).toBeUndefined()
    } finally {
      client.clear()
    }
  })

  it('keeps the last good feed when a refetch returns no page and recovers on retry', async () => {
    const client = new QueryClient()
    const page = { battles: [], nextCursor: null }
    const fetch = vi
      .spyOn(functions, request)
      .mockResolvedValueOnce(page)
      .mockResolvedValueOnce(undefined as never)
      .mockResolvedValueOnce(page)
    try {
      const previous = await client.infiniteQuery(options())
      await expect(client.infiniteQuery({ ...options(), staleTime: 0 })).rejects.toThrow('The battle feed returned no page.')
      expect(client.getQueryData(options().queryKey)).toBe(previous)
      await expect(client.infiniteQuery({ ...options(), staleTime: 0 })).resolves.toEqual(previous)
      expect(fetch).toHaveBeenCalledTimes(3)
    } finally {
      client.clear()
    }
  })

  it('keeps earlier pages when fetching the next page returns no page', async () => {
    const client = new QueryClient()
    const cursor = { at: 123, id: 'last-battle' }
    vi.spyOn(functions, request)
      .mockResolvedValueOnce({ battles: [], nextCursor: cursor })
      .mockResolvedValueOnce(undefined as never)
    try {
      const previous = await client.infiniteQuery(options())
      const observer = new InfiniteQueryObserver(client, options())
      await expect(observer.fetchNextPage({ throwOnError: true })).rejects.toThrow('The battle feed returned no page.')
      expect(client.getQueryData(options().queryKey)).toBe(previous)
    } finally {
      client.clear()
    }
  })

  it('does not publish a partial refresh when a later page is missing', async () => {
    const client = new QueryClient()
    const cursor = { at: 123, id: 'last-battle' }
    vi.spyOn(functions, request)
      .mockResolvedValueOnce({ battles: [], nextCursor: cursor })
      .mockResolvedValueOnce({ battles: [], nextCursor: null })
      .mockResolvedValueOnce({ battles: [], nextCursor: { at: 456, id: 'different-battle' } })
      .mockResolvedValueOnce(undefined as never)
    try {
      const previous = await client.infiniteQuery({ ...options(), pages: 2 })
      await expect(client.infiniteQuery({ ...options(), staleTime: 0 })).rejects.toThrow('The battle feed returned no page.')
      expect(client.getQueryData(options().queryKey)).toBe(previous)
    } finally {
      client.clear()
    }
  })

  it('uses the server cursor for the next page and stops at the end', async () => {
    const client = new QueryClient()
    const cursor = { at: 123, id: 'last-battle' }
    const fetch = vi
      .spyOn(functions, request)
      .mockResolvedValueOnce({ battles: [], nextCursor: cursor })
      .mockResolvedValueOnce({ battles: [], nextCursor: null })
    try {
      await client.infiniteQuery(options())
      const observer = new InfiniteQueryObserver(client, options())
      const result = await observer.fetchNextPage({ throwOnError: true })
      expect(result.data?.pageParams).toEqual([null, cursor])
      expect(fetch.mock.calls[1]?.[0]?.data.before).toEqual(cursor)
      expect(result.hasNextPage).toBe(false)
    } finally {
      client.clear()
    }
  })

  it('can read a cached feed with a missing page and replace it on refetch', async () => {
    const client = new QueryClient()
    client.setQueryData(options().queryKey, { pages: [undefined as never], pageParams: [null] })
    const page = { battles: [], nextCursor: null }
    vi.spyOn(functions, request).mockResolvedValue(page)
    try {
      const observer = new InfiniteQueryObserver(client, options())
      expect(observer.getCurrentResult().hasNextPage).toBe(false)
      expect(rows(observer.getCurrentResult().data)).toEqual([])
      await observer.refetch({ throwOnError: true })
      expect(observer.getCurrentResult().data?.pages).toEqual([page])
    } finally {
      client.clear()
    }
  })

  it('preserves rows on either side of a missing cached page', () => {
    expect(rows({ pages: [{ battles: ['first'] }, undefined, { battles: ['last'] }] })).toEqual(['first', 'last'])
  })
})

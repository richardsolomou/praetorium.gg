import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'
import { listLeagueBattles, listLeagues, openLeague, openLeagueRoster } from '../../server/functions'
import type { BattlesCursor } from './battles'
import { SSR_STALE_TIME } from './shared'

export const leaguesQuery = () => queryOptions({ queryKey: ['leagues'], queryFn: () => listLeagues(), staleTime: SSR_STALE_TIME })
export const leagueQuery = (token: string, eventToken?: string) =>
  queryOptions({
    queryKey: ['league', token, eventToken ?? 'current'],
    queryFn: () => openLeague({ data: { token, eventToken } }),
    staleTime: SSR_STALE_TIME,
    refetchInterval: ({ state }) => (state.data?.revealedAt ? false : 5_000),
  })

export const leagueRosterQuery = (token: string, eventToken: string | undefined, userId: string) =>
  queryOptions({
    queryKey: ['league-roster', token, eventToken, userId],
    queryFn: () => openLeagueRoster({ data: { token, eventToken, userId } }),
    enabled: Boolean(token && userId),
    staleTime: Infinity,
  })

export const leagueBattlesQuery = (token: string, eventToken: string) =>
  infiniteQueryOptions({
    queryKey: ['league-battles', token, eventToken],
    queryFn: ({ pageParam }) => listLeagueBattles({ data: { token, eventToken, before: pageParam } }),
    initialPageParam: null as BattlesCursor | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: SSR_STALE_TIME,
    refetchInterval: 5_000,
  })

export const leagueBattlesFrom = (data: { pages: { battles: unknown[] }[] } | undefined) =>
  (data?.pages.flatMap((page) => page.battles) ?? []) as Awaited<ReturnType<typeof listLeagueBattles>>['battles']

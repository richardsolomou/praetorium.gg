import { queryOptions } from '@tanstack/react-query'
import {
  leagueResults,
  leagueRosterSharing,
  listLeagueBattles,
  listLeagues,
  openLeague,
  openLeagueRoster,
  outdatedLeagueEntriesForRoster,
} from '../functions'
import { battleFeedQuery } from './battles'
import { SSR_STALE_TIME } from './shared'
import {
  leagueBattlesKey,
  leagueKey,
  leagueResultsKey,
  leagueRosterKey,
  leagueRosterSharingKey,
  leaguesKey,
  outdatedLeagueEntriesKey,
} from './queryKeys'

export const leaguesQuery = () => queryOptions({ queryKey: leaguesKey(), queryFn: () => listLeagues(), staleTime: SSR_STALE_TIME })

export const leagueRosterSharingQuery = (token: string, eventToken: string, userId: string) =>
  queryOptions({
    queryKey: leagueRosterSharingKey(token, eventToken, userId),
    queryFn: () => leagueRosterSharing({ data: { token, eventToken } }),
    staleTime: SSR_STALE_TIME,
  })
export const outdatedLeagueEntriesQuery = (rosterId: string) =>
  queryOptions({
    queryKey: outdatedLeagueEntriesKey(rosterId),
    queryFn: () => outdatedLeagueEntriesForRoster({ data: { rosterId } }),
    staleTime: SSR_STALE_TIME,
  })
export const leagueQuery = (token: string, eventToken?: string) =>
  queryOptions({
    queryKey: leagueKey(token, eventToken),
    queryFn: () => openLeague({ data: { token, eventToken } }),
    staleTime: SSR_STALE_TIME,
    refetchInterval: ({ state }) => (state.data?.revealedAt ? false : 5_000),
  })

export const leagueRosterQuery = (token: string, eventToken: string | undefined, userId: string) =>
  queryOptions({
    queryKey: leagueRosterKey(token, eventToken, userId),
    queryFn: () => openLeagueRoster({ data: { token, eventToken, userId } }),
    enabled: Boolean(token && userId),
    staleTime: Infinity,
  })

export const leagueBattlesQuery = (token: string, eventToken: string) =>
  battleFeedQuery(leagueBattlesKey(token, eventToken), (before) => listLeagueBattles({ data: { token, eventToken, before } }), 5_000)

/** Under the league's key, so every league refresh also refreshes its table; battles finish less often than the list polls. */
export const leagueResultsQuery = (token: string, eventToken: string) =>
  queryOptions({
    queryKey: leagueResultsKey(token, eventToken),
    queryFn: () => leagueResults({ data: { token, eventToken } }),
    staleTime: SSR_STALE_TIME,
    refetchInterval: 30_000,
  })

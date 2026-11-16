import { queryOptions } from '@tanstack/react-query'
import { battleGroups, groupBattles, groupLeague, groupPastLeagues, groupStandings, homeGroups, listGroups, openGroup } from '../functions'
import { SSR_STALE_TIME } from './shared'
import type { BattleFilter, BattleOrder } from '../../core/battleFilter'
import { battleFeedQuery, feedKey } from './battles'
import { battleGroupsKey, groupBattlesKey, groupKey, groupLeagueKey, groupsKey, groupStandingsKey, groupStandingsKeys } from './queryKeys'

export const groupsQuery = () => queryOptions({ queryKey: groupsKey(), queryFn: () => listGroups(), staleTime: SSR_STALE_TIME })

/** Under the standings keys, so whatever refreshes a group's table refreshes the reader's place in it too. */
export const homeGroupsQuery = (tokens: readonly string[]) =>
  queryOptions({
    queryKey: [...groupStandingsKeys(), 'home', ...tokens],
    queryFn: () => homeGroups({ data: { tokens: [...tokens] } }),
    staleTime: SSR_STALE_TIME,
  })

export const groupQuery = (token: string) =>
  queryOptions({ queryKey: groupKey(token), queryFn: () => openGroup({ data: { token } }), staleTime: SSR_STALE_TIME })

export const groupStandingsQuery = (token: string) =>
  queryOptions({ queryKey: groupStandingsKey(token), queryFn: () => groupStandings({ data: { token } }), staleTime: SSR_STALE_TIME })

export const groupLeagueQuery = (token: string) =>
  queryOptions({ queryKey: groupLeagueKey(token), queryFn: () => groupLeague({ data: { token } }), staleTime: SSR_STALE_TIME })

/** Keyed under the league so refreshing the league refreshes them too. */
export const groupPastLeaguesQuery = (token: string) =>
  queryOptions({
    queryKey: [...groupLeagueKey(token), 'past'],
    queryFn: () => groupPastLeagues({ data: { token } }),
    staleTime: SSR_STALE_TIME,
  })

export const battleGroupsQuery = (token: string) =>
  queryOptions({ queryKey: battleGroupsKey(token), queryFn: () => battleGroups({ data: { token } }), staleTime: SSR_STALE_TIME })

export const groupBattlesQuery = (token: string, filter?: BattleFilter, order?: BattleOrder) =>
  battleFeedQuery(feedKey(groupBattlesKey(token), filter, order), (before) => groupBattles({ data: { token, before, filter, order } }))

import { queryOptions } from '@tanstack/react-query'
import { battleGroups, groupLeague, groupStandings, listGroups, openGroup } from '../functions'
import { SSR_STALE_TIME } from './shared'
import { battleGroupsKey, groupKey, groupLeagueKey, groupsKey, groupStandingsKey } from './queryKeys'

export const groupsQuery = () => queryOptions({ queryKey: groupsKey(), queryFn: () => listGroups(), staleTime: SSR_STALE_TIME })

export const groupQuery = (token: string) =>
  queryOptions({ queryKey: groupKey(token), queryFn: () => openGroup({ data: { token } }), staleTime: SSR_STALE_TIME })

export const groupStandingsQuery = (token: string) =>
  queryOptions({ queryKey: groupStandingsKey(token), queryFn: () => groupStandings({ data: { token } }), staleTime: SSR_STALE_TIME })

export const groupLeagueQuery = (token: string) =>
  queryOptions({ queryKey: groupLeagueKey(token), queryFn: () => groupLeague({ data: { token } }), staleTime: SSR_STALE_TIME })

export const battleGroupsQuery = (token: string) =>
  queryOptions({ queryKey: battleGroupsKey(token), queryFn: () => battleGroups({ data: { token } }), staleTime: SSR_STALE_TIME })

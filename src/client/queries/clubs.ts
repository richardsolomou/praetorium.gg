import { queryOptions } from '@tanstack/react-query'
import { battleClubs, clubSeason, clubStandings, listClubs, openClub } from '../functions'
import { SSR_STALE_TIME } from './shared'
import { battleClubsKey, clubKey, clubSeasonKey, clubsKey, clubStandingsKey } from './queryKeys'

export const clubsQuery = () => queryOptions({ queryKey: clubsKey(), queryFn: () => listClubs(), staleTime: SSR_STALE_TIME })

export const clubQuery = (token: string) =>
  queryOptions({ queryKey: clubKey(token), queryFn: () => openClub({ data: { token } }), staleTime: SSR_STALE_TIME })

export const clubStandingsQuery = (token: string) =>
  queryOptions({ queryKey: clubStandingsKey(token), queryFn: () => clubStandings({ data: { token } }), staleTime: SSR_STALE_TIME })

export const clubSeasonQuery = (token: string) =>
  queryOptions({ queryKey: clubSeasonKey(token), queryFn: () => clubSeason({ data: { token } }), staleTime: SSR_STALE_TIME })

export const battleClubsQuery = (token: string) =>
  queryOptions({ queryKey: battleClubsKey(token), queryFn: () => battleClubs({ data: { token } }), staleTime: SSR_STALE_TIME })

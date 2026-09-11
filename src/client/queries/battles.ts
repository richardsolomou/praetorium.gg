import { infiniteQueryOptions, queryOptions, replaceEqualDeep } from '@tanstack/react-query'
import {
  battleAudience,
  battleReport,
  friendBattles,
  friendships,
  myBattles,
  openBattle,
  opponents,
  playerProfile,
  playerRankings,
  playerRosters,
  publicBattles,
  sharedBattles,
  standings,
} from '../../server/functions'
import { SSR_STALE_TIME } from './shared'

export type BattlesCursor = { at: number; id: string }

export const battlesQuery = () =>
  infiniteQueryOptions({
    queryKey: ['battles'],
    queryFn: ({ pageParam }) => myBattles({ data: { before: pageParam } }),
    initialPageParam: null as BattlesCursor | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: SSR_STALE_TIME,
  })

export const battlesFrom = (data: { pages: { battles: unknown[] }[] } | undefined) =>
  (data?.pages.flatMap((page) => page.battles) ?? []) as Awaited<ReturnType<typeof myBattles>>['battles']

const FEED_POLL_MS = 20_000

export const publicBattlesQuery = () =>
  infiniteQueryOptions({
    queryKey: ['public-battles'],
    queryFn: ({ pageParam }) => publicBattles({ data: { before: pageParam } }),
    initialPageParam: null as BattlesCursor | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: SSR_STALE_TIME,
    refetchInterval: FEED_POLL_MS,
  })

export const friendBattlesQuery = () =>
  infiniteQueryOptions({
    queryKey: ['friend-battles'],
    queryFn: ({ pageParam }) => friendBattles({ data: { before: pageParam } }),
    initialPageParam: null as BattlesCursor | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: SSR_STALE_TIME,
    refetchInterval: FEED_POLL_MS,
  })

export type PlayerProfileFilter = {
  faction?: string
  detachment?: string
  opponentFaction?: string
  opponentDetachment?: string
  opponentId?: string
  missionPackId?: string
  limit?: number
}

export const playerProfileQuery = (userId: string, filter: PlayerProfileFilter = {}) =>
  queryOptions({ queryKey: ['player-profile', userId, filter], queryFn: () => playerProfile({ data: { userId, ...filter } }) })

export const playerRostersQuery = (userId: string) =>
  queryOptions({ queryKey: ['player-rosters', userId], queryFn: () => playerRosters({ data: { userId } }) })

export const playerRankingsQuery = (userId: string) =>
  queryOptions({ queryKey: ['player-rankings', userId], queryFn: () => playerRankings({ data: { userId } }), staleTime: 60_000 })

export const standingsQuery = () => queryOptions({ queryKey: ['standings'], queryFn: () => standings(), staleTime: 60_000 })

export const battleAudienceQuery = () =>
  queryOptions({ queryKey: ['battle-audience'], queryFn: () => battleAudience(), staleTime: SSR_STALE_TIME })

export const sharedBattlesQuery = (userId: string) =>
  queryOptions({ queryKey: ['shared-battles', userId], queryFn: () => sharedBattles({ data: { userId } }), staleTime: SSR_STALE_TIME })

export const opponentsQuery = () => queryOptions({ queryKey: ['opponents'], queryFn: () => opponents(), staleTime: SSR_STALE_TIME })
export const friendshipsQuery = () => queryOptions({ queryKey: ['friendships'], queryFn: () => friendships(), staleTime: SSR_STALE_TIME })

export const battleQuery = (token: string) =>
  queryOptions({
    queryKey: ['battle', token],
    queryFn: () => openBattle({ data: { token } }),
    staleTime: SSR_STALE_TIME,
    refetchInterval: ({ state }) => (state.data?.kind === 'spectator' && state.data.view.status !== 'finished' ? 5_000 : false),
    structuralSharing: newestBattleScreen,
  })

export function newestBattleScreen<T>(oldData: T | undefined, newData: T): T {
  const oldSeq = battleSequence(oldData)
  const newSeq = battleSequence(newData)
  if (oldData !== undefined && oldSeq !== null && newSeq !== null && oldSeq > newSeq) return oldData
  return replaceEqualDeep(oldData, newData)
}

function battleSequence(value: unknown): number | null {
  if (!value || typeof value !== 'object') return null
  const screen = value as { kind?: unknown; view?: { seq?: unknown } }
  return (screen.kind === 'battle' || screen.kind === 'spectator') && typeof screen.view?.seq === 'number' ? screen.view.seq : null
}

export const reportQuery = (token: string, enabled: boolean) =>
  queryOptions({ queryKey: ['report', token], queryFn: () => battleReport({ data: { token } }), enabled, staleTime: SSR_STALE_TIME })

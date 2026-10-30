import { infiniteQueryOptions, keepPreviousData, queryOptions, replaceEqualDeep } from '@tanstack/react-query'
import {
  battleRatingChanges,
  battleReport,
  friendBattles,
  friendships,
  guestInvitation,
  guestInvite,
  myBattles,
  openBattle,
  opponents,
  playerProfile,
  playerRankings,
  playerAchievements,
  newAchievements,
  playerRosters,
  publicBattles,
  replayBattleAt,
  searchPlayers,
  standings,
} from '../functions'
import { PLAYER_SEARCH_MAX_LENGTH, PLAYER_SEARCH_MIN_LENGTH } from '../../core/playerSearch'
import type { BattlesCursor } from '../../contracts/battles'
import { SSR_STALE_TIME } from './shared'
import { liveProductRefresh } from '../liveProductRefresh'
import { uniqueBy } from '../../core/collections'
import {
  battleKey,
  battleRatingChangesKey,
  newAchievementsKey,
  battleReplayKey,
  battlesKey,
  friendBattlesKey,
  friendshipsKey,
  guestInvitationKey,
  guestInviteKey,
  opponentsKey,
  playerProfileKey,
  playerRankingsKey,
  playerAchievementsKey,
  playerRostersKey,
  playerSearchKey,
  publicBattlesKey,
  reportKey,
  standingsKey,
} from './queryKeys'

export type { BattlesCursor } from '../../contracts/battles'

/** A battle list read a page at a time, older pages before the cursor the previous page gave. */
export function battleFeedQuery<Page extends { nextCursor: BattlesCursor | null }>(
  queryKey: unknown[],
  read: (before: BattlesCursor | null) => Promise<Page | null | undefined>,
  refetchInterval?: number | (() => number | false),
) {
  return infiniteQueryOptions({
    queryKey,
    queryFn: ({ pageParam }) => read(pageParam).then(requireBattlePage),
    initialPageParam: null as BattlesCursor | null,
    // A cached feed can hold a missing page.
    getNextPageParam: (page) => (page as Page | undefined)?.nextCursor ?? undefined,
    staleTime: SSR_STALE_TIME,
    ...(refetchInterval === undefined ? {} : { refetchInterval }),
  })
}

export const battlesQuery = () => battleFeedQuery(battlesKey(), (before) => myBattles({ data: { before } }))

export function battlesFrom(data: { pages: ({ battles: unknown[] } | undefined)[] } | undefined) {
  return uniqueBy(
    (data?.pages.flatMap((page) => page?.battles ?? []) ?? []) as Awaited<ReturnType<typeof myBattles>>['battles'],
    (battle) => (typeof battle.token === 'string' ? battle.token : battle),
  )
}

function requireBattlePage<T>(page: T | null | undefined): T {
  if (page == null) throw new Error('The battle feed returned no page.')
  return page
}

const FEED_POLL_MS = 20_000
/** A page without realtime refresh polls its feeds; with it, signals refresh them. */
const feedPoll = () => (liveProductRefresh() ? false : FEED_POLL_MS)

export const publicBattlesQuery = () => battleFeedQuery(publicBattlesKey(), (before) => publicBattles({ data: { before } }), feedPoll)

export const friendBattlesQuery = () => battleFeedQuery(friendBattlesKey(), (before) => friendBattles({ data: { before } }), feedPoll)

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
  queryOptions({ queryKey: playerProfileKey(userId, filter), queryFn: () => playerProfile({ data: { userId, ...filter } }) })

export const playerRostersQuery = (userId: string) =>
  queryOptions({ queryKey: playerRostersKey(userId), queryFn: () => playerRosters({ data: { userId } }) })

export const playerRankingsQuery = (userId: string) =>
  queryOptions({ queryKey: playerRankingsKey(userId), queryFn: () => playerRankings({ data: { userId } }), staleTime: 60_000 })

export const playerAchievementsQuery = (userId: string) =>
  queryOptions({
    queryKey: playerAchievementsKey(userId),
    queryFn: () => playerAchievements({ data: { userId } }),
    staleTime: 60_000,
  })

/** Not kept for offline use: an announcement belongs to the moment it is new. */
export const newAchievementsQuery = () => queryOptions({ queryKey: newAchievementsKey(), queryFn: () => newAchievements() })

export const battleRatingChangesQuery = (token: string) =>
  queryOptions({ queryKey: battleRatingChangesKey(token), queryFn: () => battleRatingChanges({ data: { token } }), staleTime: 60_000 })

export const standingsQuery = () => queryOptions({ queryKey: standingsKey(), queryFn: () => standings(), staleTime: 60_000 })

export const opponentsQuery = () => queryOptions({ queryKey: opponentsKey(), queryFn: () => opponents(), staleTime: SSR_STALE_TIME })
export const friendshipsQuery = () => queryOptions({ queryKey: friendshipsKey(), queryFn: () => friendships(), staleTime: SSR_STALE_TIME })

/** Players a typed name could mean. A name too short to narrow anything is not worth asking about. */
export const playerSearchQuery = (query: string) =>
  queryOptions({
    queryKey: playerSearchKey(query),
    queryFn: () => searchPlayers({ data: { query } }),
    enabled: query.trim().length >= PLAYER_SEARCH_MIN_LENGTH && query.trim().length <= PLAYER_SEARCH_MAX_LENGTH,
    staleTime: 30_000,
  })

export const battleQuery = (token: string) =>
  queryOptions({
    queryKey: battleKey(token),
    queryFn: () => openBattle({ data: { token } }),
    staleTime: SSR_STALE_TIME,
    structuralSharing: newestBattleScreen,
  })

export const BATTLE_ARRIVAL_INTERVAL_MS = 2_000
export const BATTLE_ARRIVAL_CHECKS = 30

/**
 * A battle link that names no battle yet. A device can create a battle before the service
 * has it, so its link may be opened first; this asks again for a minute, under the same key
 * the route loader reads, and gives up after that so a wrong link stops costing requests.
 */
export const battleArrivalQuery = (token: string) =>
  queryOptions({
    ...battleQuery(token),
    staleTime: 0,
    refetchInterval: (query) =>
      !query.state.data && query.state.dataUpdateCount < BATTLE_ARRIVAL_CHECKS ? BATTLE_ARRIVAL_INTERVAL_MS : false,
  })

export const replayAtQuery = (token: string, seq: number, enabled: boolean) =>
  queryOptions({
    queryKey: battleReplayKey(token, seq),
    queryFn: () => replayBattleAt({ data: { token, seq } }),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: Infinity,
    gcTime: Infinity,
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
  queryOptions({ queryKey: reportKey(token), queryFn: () => battleReport({ data: { token } }), enabled, staleTime: SSR_STALE_TIME })

/**
 * A guest seat's link, made the first time it is asked for. While nobody has joined, it asks again every few seconds,
 * so the host sees the guest arrive without a signal for it.
 */
export const guestInviteQuery = (token: string, playerId: string) =>
  queryOptions({
    queryKey: guestInviteKey(token, playerId),
    queryFn: () => guestInvite({ data: { token, playerId, replace: false } }),
    refetchInterval: (query) => (query.state.data?.joined ? false : 3_000),
  })

export const guestInvitationQuery = (invite: string) =>
  queryOptions({ queryKey: guestInvitationKey(invite), queryFn: () => guestInvitation({ data: { invite } }), staleTime: SSR_STALE_TIME })

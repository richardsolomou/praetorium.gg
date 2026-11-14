import {
  infiniteQueryOptions,
  keepPreviousData,
  queryOptions,
  replaceEqualDeep,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query'
import {
  battleRatingChanges,
  battleReport,
  friendBattles,
  friendships,
  battleInvitation,
  battleDraft,
  myDrafts,
  myBattles,
  openBattle,
  opponents,
  playerBattles,
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
import { requirePage, SSR_STALE_TIME } from './shared'
import { liveProductRefresh } from '../liveProductRefresh'
import { uniqueBy } from '../../core/collections'
import { battleFilterActive, type BattleFilter, type BattleOrder } from '../../core/battleFilter'
import {
  battleKey,
  battleRatingChangesKey,
  newAchievementsKey,
  battleReplayKey,
  battlesKey,
  friendBattlesKey,
  friendshipsKey,
  battleInvitationKey,
  battleDraftKey,
  myDraftsKey,
  opponentsKey,
  playerBattlesKey,
  playerProfileKey,
  playerRankingsKey,
  playerAchievementsKey,
  playerRostersKey,
  playerSearchKey,
  publicBattlesKey,
  reportKey,
  standingsKey,
} from './queryKeys'

/** A battle list read a page at a time, older pages before the cursor the previous page gave. */
export function battleFeedQuery<Page extends { nextCursor: BattlesCursor | null }>(
  queryKey: unknown[],
  read: (before: BattlesCursor | null) => Promise<Page | null | undefined>,
  refetchInterval?: number | (() => number | false),
) {
  return infiniteQueryOptions({
    queryKey,
    queryFn: ({ pageParam }) => read(pageParam).then(requirePage<Page>('battle feed')),
    initialPageParam: null as BattlesCursor | null,
    // A cached feed can hold a missing page.
    getNextPageParam: (page) => (page as Page | undefined)?.nextCursor ?? undefined,
    staleTime: SSR_STALE_TIME,
    ...(refetchInterval === undefined ? {} : { refetchInterval }),
  })
}

/** A filter keys under its whole feed, so what refreshes the feed refreshes every filtered list of it. */
export const feedKey = (key: unknown[], filter?: BattleFilter, order?: BattleOrder) => [
  ...key,
  ...(battleFilterActive(filter) ? [filter] : []),
  ...(order ? [order] : []),
]

export const battlesQuery = (filter?: BattleFilter, order?: BattleOrder) =>
  battleFeedQuery(feedKey(battlesKey(), filter, order), (before) => myBattles({ data: { before, filter, order } }))

/** Takes a deleted battle off the player's list and drafts at once rather than after the refetch, which can take a second. */
export function forgetBattle(queryClient: QueryClient, token: string) {
  queryClient.setQueryData<InfiniteData<Awaited<ReturnType<typeof myBattles>> | undefined>>(
    battlesKey(),
    (feed) =>
      feed && {
        ...feed,
        pages: feed.pages.map((page) => page && { ...page, battles: page.battles.filter((battle) => battle.token !== token) }),
      },
  )
  void queryClient.invalidateQueries({ queryKey: battlesKey() })
  queryClient.setQueryData<Awaited<ReturnType<typeof myDrafts>>>(myDraftsKey(), (drafts) =>
    drafts?.filter((draft) => draft.token !== token),
  )
  void queryClient.invalidateQueries({ queryKey: myDraftsKey() })
}

export function battlesFrom(data: { pages: ({ battles: unknown[] } | undefined)[] } | undefined) {
  return uniqueBy(
    (data?.pages.flatMap((page) => page?.battles ?? []) ?? []) as Awaited<ReturnType<typeof myBattles>>['battles'],
    (battle) => (typeof battle.token === 'string' ? battle.token : battle),
  )
}

const FEED_POLL_MS = 20_000
/** A page without realtime refresh polls its feeds; with it, signals refresh them. */
const feedPoll = () => (liveProductRefresh() ? false : FEED_POLL_MS)

export const publicBattlesQuery = (filter?: BattleFilter, order?: BattleOrder) =>
  battleFeedQuery(
    feedKey(publicBattlesKey(), filter, order),
    (before) => publicBattles({ data: { before, filter, order } }),
    battleFilterActive(filter) || order ? undefined : feedPoll,
  )

export const friendBattlesQuery = (filter?: BattleFilter, order?: BattleOrder) =>
  battleFeedQuery(
    feedKey(friendBattlesKey(), filter, order),
    (before) => friendBattles({ data: { before, filter, order } }),
    battleFilterActive(filter) || order ? undefined : feedPoll,
  )

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

export const playerBattlesQuery = (userId: string, filter?: BattleFilter, order?: BattleOrder) =>
  battleFeedQuery(feedKey(playerBattlesKey(userId), filter, order), (before) => playerBattles({ data: { userId, before, filter, order } }))

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

export const battleInvitationQuery = (invite: string) =>
  queryOptions({ queryKey: battleInvitationKey(invite), queryFn: () => battleInvitation({ data: { invite } }), staleTime: SSR_STALE_TIME })

/** Whether a battle is still a draft, and to a player in it the link that joins it. */
export const battleDraftQuery = (token: string) =>
  queryOptions({ queryKey: battleDraftKey(token), queryFn: () => battleDraft({ data: { token } }), staleTime: SSR_STALE_TIME })

/** The signed-in player's drafts, which New battle and Battles offer to continue rather than listing. */
export const myDraftsQuery = () => queryOptions({ queryKey: myDraftsKey(), queryFn: () => myDrafts(), staleTime: SSR_STALE_TIME })

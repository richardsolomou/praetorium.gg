import { infiniteQueryOptions, type QueryClient, queryOptions, replaceEqualDeep } from '@tanstack/react-query'
import type { AdminUsersCursor } from '../admin'
import type { FormatRuleId, OptionalRuleId } from '../core/battle'
import type { RosterPick } from '../core/roster'
import {
  battleReport,
  accountMethods,
  adminUsers,
  battleAudience,
  friendBattles,
  publicBattles,
  standings,
  catalogueStatus,
  collection,
  deployments,
  datasheet,
  datasheetBySlug,
  detachmentRules,
  detachmentDetail,
  faction,
  factionDatasheets,
  factionIndex,
  favouriteFactions,
  favouriteDetachments,
  friendships,
  gameReferences,
  globalSearch,
  loadoutDatasheets,
  listLeagues,
  listLeagueBattles,
  me,
  openLeague,
  openLeagueRoster,
  myBattles,
  openBattle,
  opponents,
  sharedBattles,
  userProfile,
  priceRoster,
  rosterAccess,
  savedRosterSummaries,
  savedRosterPoints,
  savedRosterLoadoutDatasheets,
  savedRosterPrice,
  sharedRoster,
  signInOptions,
  terrainReferences,
  units,
} from '../server/functions'

const SSR_STALE_TIME = 30_000

export const meQuery = () => queryOptions({ queryKey: ['me'], queryFn: () => me(), staleTime: SSR_STALE_TIME })
export const accountMethodsQuery = () =>
  queryOptions({ queryKey: ['account-methods'], queryFn: () => accountMethods(), staleTime: SSR_STALE_TIME })
export const ADMIN_USERS_QUERY_KEY = ['admin-users'] as const
export const adminUsersQuery = (query: string) =>
  infiniteQueryOptions({
    queryKey: [...ADMIN_USERS_QUERY_KEY, query],
    queryFn: ({ pageParam }) => adminUsers({ data: { query, cursor: pageParam } }),
    initialPageParam: null as AdminUsersCursor | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: SSR_STALE_TIME,
  })

export const userProfileQuery = (userId: string, battle?: string) =>
  queryOptions({
    queryKey: ['user-profile', userId, battle],
    queryFn: () => userProfile({ data: { userId, battle } }),
    staleTime: SSR_STALE_TIME,
  })

/** Where the previous battles page ended; matches the server's cursor schema. */
type BattlesCursor = { activity: number; id: string }

export const battlesQuery = () =>
  infiniteQueryOptions({
    queryKey: ['battles'],
    queryFn: ({ pageParam }) => myBattles({ data: { before: pageParam } }),
    initialPageParam: null as BattlesCursor | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: SSR_STALE_TIME,
  })

/** The loaded battle pages as one list, however many the reader has asked for. */
export const battlesFrom = (data: { pages: { battles: unknown[] }[] } | undefined) =>
  (data?.pages.flatMap((page) => page.battles) ?? []) as Awaited<ReturnType<typeof myBattles>>['battles']

/**
 * The battles anyone may watch, and the ones a player's friends are in.
 *
 * Both poll rather than subscribe. A player's own battles are told about over
 * realtime because their device is a seat at that table; these are somebody
 * else's tables, so no channel exists that names this reader — and a channel
 * every visitor to the home page subscribes to would be a broadcast to the whole
 * instance for a list that reads perfectly well a few seconds late. React Query
 * pauses the interval while the tab is in the background.
 */
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

/** The standings. The server holds them for a minute, so asking oftener answers the same. */
export const standingsQuery = () => queryOptions({ queryKey: ['standings'], queryFn: () => standings(), staleTime: 60_000 })

export const battleAudienceQuery = () =>
  queryOptions({ queryKey: ['battle-audience'], queryFn: () => battleAudience(), staleTime: SSR_STALE_TIME })

export const sharedBattlesQuery = (userId: string) =>
  queryOptions({
    queryKey: ['shared-battles', userId],
    queryFn: () => sharedBattles({ data: { userId } }),
    staleTime: SSR_STALE_TIME,
  })
export const opponentsQuery = () => queryOptions({ queryKey: ['opponents'], queryFn: () => opponents(), staleTime: SSR_STALE_TIME })
export const friendshipsQuery = () => queryOptions({ queryKey: ['friendships'], queryFn: () => friendships(), staleTime: SSR_STALE_TIME })
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

// Seated battles use realtime; read-only spectators poll while the battle is active.
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
  return screen.kind === 'battle' && typeof screen.view?.seq === 'number' ? screen.view.seq : null
}

/** One faction by route slug or catalogue id, for the pages that render exactly one. */
export const factionQuery = (catalogueId: string) =>
  queryOptions({ queryKey: ['faction', catalogueId], queryFn: () => faction({ data: { catalogueId } }), staleTime: Infinity })
export const factionIndexQuery = () => queryOptions({ queryKey: ['faction-index'], queryFn: () => factionIndex(), staleTime: Infinity })
export const favouriteFactionsQuery = () =>
  queryOptions({ queryKey: ['favourite-factions'], queryFn: () => favouriteFactions(), staleTime: SSR_STALE_TIME })
export const favouriteDetachmentsQuery = () =>
  queryOptions({ queryKey: ['favourite-detachments'], queryFn: () => favouriteDetachments(), staleTime: SSR_STALE_TIME })
export const gameReferencesQuery = () =>
  queryOptions({
    queryKey: ['game-references'],
    queryFn: () => gameReferences(),
    staleTime: ({ state }) => (state.data ? Infinity : 0),
    refetchInterval: ({ state }) => gameReferencesRefreshInterval(state.data),
  })

export const gameReferencesRefreshInterval = (data: unknown) => (data ? false : 1_000)

export const globalSearchQuery = (query: string) =>
  queryOptions({
    queryKey: ['global-search', query],
    queryFn: () => globalSearch({ data: { query } }),
    enabled: query.trim().length >= 2,
    staleTime: 30_000,
  })

export const terrainMatchupIds = (dispositions: readonly string[]) => {
  const matchup = dispositions.length === 2 ? dispositions : []
  return matchup.length === 2 ? [...new Set([`${matchup[0]}-vs-${matchup[1]}`, `${matchup[1]}-vs-${matchup[0]}`])].toSorted() : []
}

export const terrainReferencesQuery = (matchupIds: readonly string[]) =>
  queryOptions({
    queryKey: ['terrain-references', ...matchupIds],
    queryFn: () => terrainReferences({ data: { matchupIds: [...matchupIds] } }),
    enabled: Boolean(matchupIds.length),
    staleTime: Infinity,
  })

/** The datasheets the player owns models for, so the picker can filter on it. */
export const collectionQuery = () => queryOptions({ queryKey: ['collection'], queryFn: () => collection(), staleTime: SSR_STALE_TIME })

export const unitsQuery = (catalogueId: string, query: string, battleSize?: number, waivedRules: readonly FormatRuleId[] = []) =>
  queryOptions({
    queryKey: ['units', catalogueId, query, battleSize ?? null, waivedRules],
    queryFn: () =>
      units({ data: { catalogueId, query, ...(battleSize === undefined ? {} : { battleSize }), waivedRules: [...waivedRules] } }),
    enabled: Boolean(catalogueId),
    staleTime: SSR_STALE_TIME,
  })

export const factionDatasheetsQuery = (catalogueId: string, query: string) =>
  queryOptions({
    queryKey: ['faction-datasheets', catalogueId, query],
    queryFn: () => factionDatasheets({ data: { catalogueId, query } }),
    enabled: Boolean(catalogueId),
    staleTime: SSR_STALE_TIME,
  })

export const datasheetQuery = (
  catalogueId: string,
  entryId: string,
  detachmentIds: readonly string[] = [],
  picks: readonly RosterPick[] = [],
  pickIndex: number | null = null,
  everyWeapon = false,
) =>
  queryOptions({
    queryKey: ['datasheet', catalogueId, entryId, detachmentIds, picks, pickIndex, everyWeapon],
    queryFn: () =>
      datasheet({ data: { catalogueId, entryId, detachmentIds: [...detachmentIds], picks: [...picks], pickIndex, everyWeapon } }),
    enabled: Boolean(catalogueId && entryId),
    staleTime: Infinity,
  })

export const datasheetSlugQuery = (catalogueId: string, slug: string) =>
  queryOptions({
    queryKey: ['datasheet-slug', catalogueId, slug],
    queryFn: () => datasheetBySlug({ data: { catalogueId, slug } }),
    enabled: Boolean(catalogueId && slug),
    staleTime: Infinity,
  })

export const loadoutDatasheetsQuery = (
  catalogueId: string,
  entryId: string,
  detachmentIds: readonly string[],
  picks: readonly RosterPick[],
  pickIndex: number | null,
  persistedRoster?: { id: string; battle?: string },
  onLoaded?: (durationMs: number) => void,
) =>
  queryOptions({
    queryKey: persistedRoster
      ? ['saved-roster-loadout-datasheets', persistedRoster.id, persistedRoster.battle ?? null, pickIndex]
      : ['loadout-datasheets', catalogueId, entryId, detachmentIds, picks, pickIndex],
    queryFn: async () => {
      const startedAt = performance.now()
      const result =
        persistedRoster && pickIndex !== null
          ? await savedRosterLoadoutDatasheets({
              data: {
                id: persistedRoster.id,
                ...(persistedRoster.battle ? { battle: persistedRoster.battle } : {}),
                pickIndex,
              },
            })
          : await loadoutDatasheets({
              data: { catalogueId, entryId, detachmentIds: [...detachmentIds], picks: [...picks], pickIndex },
            })
      onLoaded?.(performance.now() - startedAt)
      return result
    },
    enabled: Boolean((persistedRoster && pickIndex !== null) || (catalogueId && entryId)),
    staleTime: Infinity,
  })

/** Keyed on the picks, so the price follows the list without anything having to remember to ask. */
export const priceQuery = (
  catalogueId: string,
  detachmentIds: readonly string[],
  disposition: string | null,
  limit: number,
  picked: readonly RosterPick[],
  waivedRules: readonly FormatRuleId[] = [],
  borrowedDetachmentId: string | null = null,
  optionalRules: readonly OptionalRuleId[] = [],
) =>
  queryOptions({
    // The picks stay last: the placeholder that survives a removed unit reads them
    // off the end of the key.
    queryKey: ['price', catalogueId, detachmentIds, disposition, limit, waivedRules, borrowedDetachmentId, optionalRules, picked],
    queryFn: () =>
      priceRoster({
        data: {
          catalogueId,
          detachmentIds: [...detachmentIds],
          disposition,
          borrowedDetachmentId,
          limit,
          units: [...picked],
          waivedRules: [...waivedRules],
          optionalRules: [...optionalRules],
        },
      }),
    enabled: Boolean(catalogueId),
    staleTime: SSR_STALE_TIME,
  })

/** Hydrates the same pricing cache entry through a refresh-safe GET keyed by saved id. */
export const savedRosterPriceQuery = (
  id: string,
  catalogueId: string,
  detachmentIds: readonly string[],
  disposition: string | null,
  limit: number,
  picked: readonly RosterPick[],
  battle?: string,
  waivedRules: readonly FormatRuleId[] = [],
  borrowedDetachmentId: string | null = null,
  optionalRules: readonly OptionalRuleId[] = [],
) =>
  queryOptions({
    ...priceQuery(catalogueId, detachmentIds, disposition, limit, picked, waivedRules, borrowedDetachmentId, optionalRules),
    queryFn: () => savedRosterPrice({ data: { id, ...(battle ? { battle } : {}) } }),
  })

export const savedRosterSummariesQuery = () =>
  queryOptions({ queryKey: ['saved-roster-summaries'], queryFn: () => savedRosterSummaries(), staleTime: SSR_STALE_TIME })

/** Every list's total in one answer, so a library of twenty rows is one request rather than twenty. */
export const savedRosterPointsQuery = () =>
  queryOptions({ queryKey: ['saved-roster-points'], queryFn: () => savedRosterPoints(), staleTime: SSR_STALE_TIME })

/**
 * What "the library changed" means, decided once.
 *
 * The lists and their totals are two reads of one thing, so anything that saves,
 * imports, duplicates or deletes a list says so here rather than each caller
 * remembering both keys — and the totals silently going stale when one forgets.
 */
export function invalidateSavedRosters(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['roster-access'] }),
    queryClient.invalidateQueries({ queryKey: savedRosterSummariesQuery().queryKey }),
    queryClient.invalidateQueries({ queryKey: savedRosterPointsQuery().queryKey }),
  ])
}

/** `battle` is what entitles a seated opponent to read a list that is otherwise private. */
export const sharedRosterQuery = (id: string, battle?: string) =>
  queryOptions({
    queryKey: ['shared-roster', id, battle ?? null],
    queryFn: () => sharedRoster({ data: { id, ...(battle ? { battle } : {}) } }),
    staleTime: SSR_STALE_TIME,
  })

export const rosterAccessQuery = (id: string, battle?: string) =>
  queryOptions({
    queryKey: ['roster-access', id, battle ?? null],
    queryFn: () => rosterAccess({ data: { id, ...(battle ? { battle } : {}) } }),
    staleTime: SSR_STALE_TIME,
  })

/** Null when the rules source has not been synced, so the interface can offer typing instead. */
export const detachmentRulesQuery = (catalogueId: string, detachmentNames: readonly string[]) =>
  queryOptions({
    queryKey: ['detachment-rules', catalogueId, detachmentNames],
    queryFn: () => detachmentRules({ data: { catalogueId, detachmentNames: [...detachmentNames] } }),
    enabled: Boolean(catalogueId && detachmentNames.length),
    staleTime: Infinity,
  })

export const detachmentDetailQuery = (catalogueId: string, slug: string) =>
  queryOptions({
    queryKey: ['detachment-detail', catalogueId, slug],
    queryFn: () => detachmentDetail({ data: { catalogueId, slug } }),
    enabled: Boolean(catalogueId && slug),
    staleTime: Infinity,
  })

export const deploymentsQuery = () => queryOptions({ queryKey: ['deployments'], queryFn: () => deployments(), staleTime: Infinity })

export const reportQuery = (token: string, enabled: boolean) =>
  queryOptions({ queryKey: ['report', token], queryFn: () => battleReport({ data: { token } }), enabled, staleTime: SSR_STALE_TIME })

/** Polled only while the data is on its way, so a settled instance asks once. */
export const catalogueStatusQuery = () =>
  queryOptions({
    queryKey: ['catalogue-status'],
    queryFn: () => catalogueStatus(),
    refetchInterval: (query) => (query.state.data?.status === 'working' ? 3000 : false),
  })

export const signInOptionsQuery = () => queryOptions({ queryKey: ['sign-in-options'], queryFn: () => signInOptions(), staleTime: Infinity })

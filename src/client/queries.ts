import { type QueryClient, queryOptions, replaceEqualDeep } from '@tanstack/react-query'
import type { RosterPick } from '../core/roster'
import {
  battleReport,
  catalogueStatus,
  collection,
  deployments,
  datasheet,
  datasheetBySlug,
  detachmentRules,
  detachmentDetail,
  factions,
  factionDatasheets,
  factionIndex,
  favouriteFactions,
  favouriteDetachments,
  friendships,
  gameReferences,
  globalSearch,
  loadoutDatasheets,
  me,
  myEvents,
  openEvent,
  myBattles,
  openBattle,
  opponents,
  userProfile,
  priceRoster,
  savedRosters,
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

export const userProfileQuery = (userId: string) =>
  queryOptions({ queryKey: ['user-profile', userId], queryFn: () => userProfile({ data: { userId } }), staleTime: SSR_STALE_TIME })

export const battlesQuery = () => queryOptions({ queryKey: ['battles'], queryFn: () => myBattles(), staleTime: SSR_STALE_TIME })
export const opponentsQuery = () => queryOptions({ queryKey: ['opponents'], queryFn: () => opponents(), staleTime: SSR_STALE_TIME })
export const friendshipsQuery = () => queryOptions({ queryKey: ['friendships'], queryFn: () => friendships(), staleTime: SSR_STALE_TIME })
export const eventsQuery = () => queryOptions({ queryKey: ['events'], queryFn: () => myEvents(), staleTime: SSR_STALE_TIME })
export const eventQuery = (id: string) =>
  queryOptions({ queryKey: ['event', id], queryFn: () => openEvent({ data: { id } }), staleTime: SSR_STALE_TIME })

// No polling: `useLiveBattle` refetches this when the server says the battle changed.
export const battleQuery = (token: string) =>
  queryOptions({
    queryKey: ['battle', token],
    queryFn: () => openBattle({ data: { token } }),
    staleTime: SSR_STALE_TIME,
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

export const factionsQuery = () => queryOptions({ queryKey: ['factions'], queryFn: () => factions(), staleTime: Infinity })
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

export const terrainMatchupIds = (dispositions: readonly string[], solo = false) => {
  const matchup = dispositions.length === 2 ? dispositions : solo && dispositions[0] ? [dispositions[0], dispositions[0]] : []
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

export const unitsQuery = (catalogueId: string, query: string) =>
  queryOptions({
    queryKey: ['units', catalogueId, query],
    queryFn: () => units({ data: { catalogueId, query } }),
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
) =>
  queryOptions({
    queryKey: ['price', catalogueId, detachmentIds, disposition, limit, picked],
    queryFn: () => priceRoster({ data: { catalogueId, detachmentIds: [...detachmentIds], disposition, limit, units: [...picked] } }),
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
) =>
  queryOptions({
    ...priceQuery(catalogueId, detachmentIds, disposition, limit, picked),
    queryFn: () => savedRosterPrice({ data: { id, ...(battle ? { battle } : {}) } }),
  })

export const savedRostersQuery = () =>
  queryOptions({ queryKey: ['saved-rosters'], queryFn: () => savedRosters(), staleTime: SSR_STALE_TIME })

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
    queryClient.invalidateQueries({ queryKey: savedRostersQuery().queryKey }),
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
  queryOptions({ queryKey: ['report', token], queryFn: () => battleReport({ data: { token } }), enabled })

/** Polled only while the data is on its way, so a settled instance asks once. */
export const catalogueStatusQuery = () =>
  queryOptions({
    queryKey: ['catalogue-status'],
    queryFn: () => catalogueStatus(),
    refetchInterval: (query) => (query.state.data?.status === 'working' ? 3000 : false),
  })

export const signInOptionsQuery = () => queryOptions({ queryKey: ['sign-in-options'], queryFn: () => signInOptions(), staleTime: Infinity })

import { TERRAIN_GEOMETRY_VERSION } from '../../contracts/terrainReference'
import { anySignal } from '../abortSignals'
export { terrainMatchupIds } from '../../contracts/terrainReference'
import { offlineSearch } from '../offline/runtime'
import { queryOptions, type QueryClient } from '@tanstack/react-query'
import { referenceFactionId } from '../../core/factionReferenceRoute'
import { SEARCH_MIN_LENGTH } from '../../core/referenceSearch'
import {
  datasheetBySlug,
  deployments,
  detachmentDetail,
  detachmentRules,
  dispositionDetachments,
  faction,
  factionIndex,
  favouriteDetachments,
  favouriteDatasheets,
  favouriteFactions,
  gameReferences,
  globalSearch,
  ruleIndex,
  ruleSection,
  terrainReferences,
} from '../functions'
import { referenceQuery, referenceStaleTime, SSR_STALE_TIME } from './shared'
import { factionIndexKey, factionKey, favouriteDatasheetsKey, favouriteDetachmentsKey, favouriteFactionsKey } from './queryKeys'

export const factionQuery = (catalogueId: string) => referenceQuery(factionKey(catalogueId), () => faction({ data: { catalogueId } }))
export const factionIndexQuery = () => referenceQuery(factionIndexKey(), () => factionIndex())

export async function loadReferenceFaction(client: QueryClient, catalogueId: string, rules?: string) {
  const index = await client.query({ ...factionIndexQuery(), staleTime: 'static' })
  const selected = rules ? referenceFactionId(index?.factions ?? [], catalogueId, rules) : catalogueId
  const loaded = selected ? await client.query({ ...factionQuery(selected), staleTime: 'static' }) : null
  if (loaded && loaded.id !== selected) client.setQueryData(factionQuery(loaded.id).queryKey, loaded)
  return loaded
}
export const favouriteFactionsQuery = () =>
  queryOptions({
    queryKey: favouriteFactionsKey(),
    queryFn: () => favouriteFactions(),
    staleTime: SSR_STALE_TIME,
  })
export const favouriteDatasheetsQuery = () =>
  queryOptions({
    queryKey: favouriteDatasheetsKey(),
    queryFn: () => favouriteDatasheets(),
    staleTime: SSR_STALE_TIME,
  })
export const favouriteDetachmentsQuery = () =>
  queryOptions({
    queryKey: favouriteDetachmentsKey(),
    queryFn: () => favouriteDetachments(),
    staleTime: SSR_STALE_TIME,
  })
/** Startup data the server may not have read yet, asked for every second until it answers. */
const untilLoaded = {
  staleTime: ({ state }: { state: { data: unknown } }) => (state.data ? referenceStaleTime() : 0),
  refetchInterval: ({ state }: { state: { data: unknown } }) => (state.data ? false : 1_000),
}
export const gameReferencesQuery = () => queryOptions({ ...referenceQuery(['game-references'], () => gameReferences()), ...untilLoaded })
export const globalSearchQuery = (query: string) =>
  queryOptions({
    queryKey: ['global-search', query],
    networkMode: 'always',
    initialData: () => (query.trim().length >= SEARCH_MIN_LENGTH ? (offlineSearch(query) ?? undefined) : undefined),
    initialDataUpdatedAt: 0,
    queryFn: async ({ signal, client }) => {
      const saved = offlineSearch(query, client)
      if (saved && !navigator.onLine) return saved
      try {
        return await globalSearch({ data: { query }, signal: anySignal([signal, AbortSignal.timeout(5_000)]) })
      } catch (error) {
        if (saved) return saved
        throw error
      }
    },
    enabled: query.trim().length >= SEARCH_MIN_LENGTH,
    staleTime: 30_000,
  })

export const terrainReferencesQuery = (matchupIds: readonly string[]) =>
  queryOptions({
    ...referenceQuery(['terrain-references', TERRAIN_GEOMETRY_VERSION, ...matchupIds], () =>
      terrainReferences({ data: { matchupIds: [...matchupIds], geometryVersion: TERRAIN_GEOMETRY_VERSION } }),
    ),
    enabled: Boolean(matchupIds.length),
  })

export const datasheetSlugQuery = (catalogueId: string, slug: string) =>
  queryOptions({
    ...referenceQuery(['datasheet-slug', catalogueId, slug], () => datasheetBySlug({ data: { catalogueId, slug } })),
    enabled: Boolean(catalogueId && slug),
  })
export const detachmentRulesQuery = (catalogueId: string, detachmentNames: readonly string[]) =>
  queryOptions({
    queryKey: ['detachment-rules', catalogueId, detachmentNames],
    queryFn: ({ signal }) => detachmentRules({ data: { catalogueId, detachmentNames: [...detachmentNames] }, signal }),
    enabled: Boolean(catalogueId && detachmentNames.length),
    staleTime: Infinity,
  })
export const detachmentDetailQuery = (catalogueId: string, slug: string) =>
  queryOptions({
    ...referenceQuery(['detachment-detail', catalogueId, slug], () => detachmentDetail({ data: { catalogueId, slug } })),
    enabled: Boolean(catalogueId && slug),
  })
export const dispositionDetachmentsQuery = (dispositionId: string) =>
  referenceQuery(['disposition-detachments', dispositionId], () => dispositionDetachments({ data: { dispositionId } }))
export const deploymentsQuery = () => referenceQuery(['deployments'], () => deployments())
export const ruleIndexQuery = () => queryOptions({ ...referenceQuery(['rule-index'], () => ruleIndex()), ...untilLoaded })
export const ruleSectionQuery = (documentId: string, sectionId: string) =>
  queryOptions({
    ...referenceQuery(['rule-section', documentId, sectionId], () => ruleSection({ data: { documentId, sectionId } })),
    enabled: Boolean(documentId && sectionId),
  })

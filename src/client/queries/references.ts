import { TERRAIN_GEOMETRY_VERSION } from '../../contracts/terrainReference'
import { anySignal } from '../abortSignals'
export { terrainMatchupIds } from '../../contracts/terrainReference'
import { referenceRead, offlineSearch } from '../offline/runtime'
import { queryOptions } from '@tanstack/react-query'
import {
  catalogueStatus,
  datasheetBySlug,
  deployments,
  detachmentDetail,
  detachmentRules,
  dispositionDetachments,
  faction,
  factionIndex,
  favouriteDetachments,
  favouriteFactions,
  gameReferences,
  globalSearch,
  ruleIndex,
  ruleSection,
  terrainReferences,
} from '../functions'
import { SSR_STALE_TIME } from './shared'

export const factionQuery = (catalogueId: string) =>
  queryOptions({
    queryKey: ['faction', catalogueId],
    queryFn: () => referenceRead(['faction', catalogueId], () => faction({ data: { catalogueId } })),
    staleTime: Infinity,
  })
export const factionIndexQuery = () =>
  queryOptions({ queryKey: ['faction-index'], queryFn: () => referenceRead(['faction-index'], () => factionIndex()), staleTime: Infinity })
export const favouriteFactionsQuery = () =>
  queryOptions({
    queryKey: ['favourite-factions'],
    queryFn: () => favouriteFactions(),
    staleTime: SSR_STALE_TIME,
  })
export const favouriteDetachmentsQuery = () =>
  queryOptions({
    queryKey: ['favourite-detachments'],
    queryFn: () => favouriteDetachments(),
    staleTime: SSR_STALE_TIME,
  })
export const gameReferencesQuery = () =>
  queryOptions({
    queryKey: ['game-references'],
    queryFn: () => referenceRead(['game-references'], () => gameReferences()),
    staleTime: ({ state }) => (state.data ? Infinity : 0),
    refetchInterval: ({ state }) => gameReferencesRefreshInterval(state.data),
  })

export const gameReferencesRefreshInterval = (data: unknown) => (data ? false : 1_000)
export const globalSearchQuery = (query: string) =>
  queryOptions({
    queryKey: ['global-search', query],
    networkMode: 'always',
    initialData: () => offlineSearch(query) ?? undefined,
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
    enabled: query.trim().length >= 2,
    staleTime: 30_000,
  })

export const terrainReferencesQuery = (matchupIds: readonly string[]) =>
  queryOptions({
    queryKey: ['terrain-references', TERRAIN_GEOMETRY_VERSION, ...matchupIds],
    queryFn: () =>
      referenceRead(['terrain-references', TERRAIN_GEOMETRY_VERSION, ...matchupIds], () =>
        terrainReferences({ data: { matchupIds: [...matchupIds], geometryVersion: TERRAIN_GEOMETRY_VERSION } }),
      ),
    enabled: Boolean(matchupIds.length),
    staleTime: Infinity,
  })

export const datasheetSlugQuery = (catalogueId: string, slug: string) =>
  queryOptions({
    queryKey: ['datasheet-slug', catalogueId, slug],
    queryFn: () => referenceRead(['datasheet-slug', catalogueId, slug], () => datasheetBySlug({ data: { catalogueId, slug } })),
    enabled: Boolean(catalogueId && slug),
    staleTime: Infinity,
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
    queryKey: ['detachment-detail', catalogueId, slug],
    queryFn: () => referenceRead(['detachment-detail', catalogueId, slug], () => detachmentDetail({ data: { catalogueId, slug } })),
    enabled: Boolean(catalogueId && slug),
    staleTime: Infinity,
  })
export const dispositionDetachmentsQuery = (dispositionId: string) =>
  queryOptions({
    queryKey: ['disposition-detachments', dispositionId],
    queryFn: () => referenceRead(['disposition-detachments', dispositionId], () => dispositionDetachments({ data: { dispositionId } })),
    staleTime: Infinity,
  })
export const deploymentsQuery = () =>
  queryOptions({ queryKey: ['deployments'], queryFn: () => referenceRead(['deployments'], () => deployments()), staleTime: Infinity })
export const ruleIndexQuery = () =>
  queryOptions({
    queryKey: ['rule-index'],
    queryFn: () => referenceRead(['rule-index'], () => ruleIndex()),
    staleTime: ({ state }) => (state.data ? Infinity : 0),
    refetchInterval: ({ state }) => (state.data ? false : 1_000),
  })
export const ruleSectionQuery = (documentId: string, sectionId: string) =>
  queryOptions({
    queryKey: ['rule-section', documentId, sectionId],
    queryFn: () => referenceRead(['rule-section', documentId, sectionId], () => ruleSection({ data: { documentId, sectionId } })),
    enabled: Boolean(documentId && sectionId),
    staleTime: Infinity,
  })
export const catalogueStatusQuery = () =>
  queryOptions({
    queryKey: ['catalogue-status'],
    queryFn: () => catalogueStatus(),
    refetchInterval: (query) => (query.state.data?.status === 'working' ? 3000 : false),
  })

import { queryOptions } from '@tanstack/react-query'
import {
  catalogueStatus,
  datasheetBySlug,
  deployments,
  detachmentDetail,
  detachmentRules,
  faction,
  factionIndex,
  favouriteDetachments,
  favouriteFactions,
  gameReferences,
  globalSearch,
  ruleIndex,
  ruleSection,
  terrainReferences,
} from '../../server/functions'
import { SSR_STALE_TIME } from './shared'

const TERRAIN_GEOMETRY_VERSION = 3

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
    queryKey: ['terrain-references', TERRAIN_GEOMETRY_VERSION, ...matchupIds],
    queryFn: () => terrainReferences({ data: { matchupIds: [...matchupIds], geometryVersion: TERRAIN_GEOMETRY_VERSION } }),
    enabled: Boolean(matchupIds.length),
    staleTime: Infinity,
  })

export const datasheetSlugQuery = (catalogueId: string, slug: string) =>
  queryOptions({
    queryKey: ['datasheet-slug', catalogueId, slug],
    queryFn: () => datasheetBySlug({ data: { catalogueId, slug } }),
    enabled: Boolean(catalogueId && slug),
    staleTime: Infinity,
  })
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
export const ruleIndexQuery = () =>
  queryOptions({
    queryKey: ['rule-index'],
    queryFn: () => ruleIndex(),
    staleTime: ({ state }) => (state.data ? Infinity : 0),
    refetchInterval: ({ state }) => (state.data ? false : 1_000),
  })
export const ruleSectionQuery = (documentId: string, sectionId: string) =>
  queryOptions({
    queryKey: ['rule-section', documentId, sectionId],
    queryFn: () => ruleSection({ data: { documentId, sectionId } }),
    enabled: Boolean(documentId && sectionId),
    staleTime: Infinity,
  })
export const catalogueStatusQuery = () =>
  queryOptions({
    queryKey: ['catalogue-status'],
    queryFn: () => catalogueStatus(),
    refetchInterval: (query) => (query.state.data?.status === 'working' ? 3000 : false),
  })

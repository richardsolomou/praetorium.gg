import type { QueryClient } from '@tanstack/react-query'
import { notFound, redirect } from '@tanstack/react-router'
import { currentRulesFor } from '../../../../core/currentRules'
import { factionReferenceHref } from '../../../../core/factionReferenceRoute'
import { datasheetPreview, detachmentPreview, pageHead, previewImage } from '../../../linkPreview'
import {
  datasheetSlugQuery,
  detachmentDetailQuery,
  favouriteDetachmentsQuery,
  favouriteFactionsQuery,
  factionIndexQuery,
  factionQuery,
  loadReferenceFaction,
  referenceChangesQuery,
  factionDatasheetsQuery,
} from '../../../queries'

type Faction = NonNullable<Awaited<ReturnType<typeof loadReferenceFaction>>>

/**
 * The current rules' copy of a superseded rules version's faction, so its pages name the current page as canonical
 * instead of splitting search ranking across versions; a preview is upcoming rules rather than an older copy, so it keeps its own.
 */
async function currentFactionFor(queryClient: QueryClient, faction: Faction) {
  const index = await queryClient.query({ ...factionIndexQuery(), staleTime: 'static' })
  const current = currentRulesFor(faction.id, index?.factions ?? [])
  return current ? queryClient.query({ ...factionQuery(current.id), staleTime: 'static' }) : null
}

export async function loadFactionPage(queryClient: QueryClient, catalogueId: string, rules?: string) {
  const [faction] = await Promise.all([
    loadReferenceFaction(queryClient, catalogueId, rules),
    queryClient.query({ ...favouriteFactionsQuery(), staleTime: 'static' }),
    queryClient.query({ ...favouriteDetachmentsQuery(), staleTime: 'static' }),
  ])
  if (!faction) throw notFound()
  return { faction, canonical: (await currentFactionFor(queryClient, faction)) ?? faction }
}

export function factionPageHead(loaderData: Awaited<ReturnType<typeof loadFactionPage>> | undefined, origin: string) {
  if (!loaderData) return {}
  const { faction, canonical } = loaderData
  return pageHead(origin, {
    title: faction.displayName,
    description: `${faction.displayName} army rules, detachments, datasheets, loadouts and points.`,
    path: factionReferenceHref(canonical),
  })
}

export async function loadFactionDatasheets(queryClient: QueryClient, catalogueId: string, rules?: string) {
  const faction = await loadReferenceFaction(queryClient, catalogueId, rules)
  if (!faction) throw notFound()
  const [canonical] = await Promise.all([
    currentFactionFor(queryClient, faction),
    queryClient.query({ ...factionDatasheetsQuery(faction.id, ''), staleTime: 'static' }),
  ])
  return { faction, canonical: canonical ?? faction }
}

export function factionDatasheetsHead(loaderData: Awaited<ReturnType<typeof loadFactionDatasheets>> | undefined, origin: string) {
  if (!loaderData) return {}
  const { faction, canonical } = loaderData
  return pageHead(origin, {
    title: `${faction.displayName} datasheets`,
    description: `${faction.displayName} datasheets, unit profiles, weapons, wargear and points.`,
    path: factionReferenceHref(canonical, '/datasheets'),
    breadcrumbs: [
      { name: 'Factions', path: '/factions' },
      { name: canonical.displayName, path: factionReferenceHref(canonical) },
      { name: 'Datasheets', path: factionReferenceHref(canonical, '/datasheets') },
    ],
  })
}

export async function loadFactionDatasheet(queryClient: QueryClient, catalogueId: string, entryId: string, rules?: string) {
  const faction = await loadReferenceFaction(queryClient, catalogueId, rules)
  if (!faction) throw notFound()
  const sheet = await queryClient.query({ ...datasheetSlugQuery(faction.id, entryId), staleTime: 'static' })
  if (!sheet) throw notFound()
  // A slug gains and loses its id suffix between catalogue updates, so a cached permanent redirect from one form could bounce back from the other.
  if (sheet.slug !== entryId)
    throw redirect({
      href: factionReferenceHref(faction, `/datasheets/${sheet.slug}`),
      ...(entryId === sheet.id
        ? { statusCode: 301, headers: { 'Cache-Control': 'public, max-age=3600' } }
        : { statusCode: 307, headers: { 'Cache-Control': 'no-store' } }),
    })
  const [current] = await Promise.all([
    currentFactionFor(queryClient, faction),
    queryClient.query({
      ...referenceChangesQuery({ kind: 'datasheet', faction: faction.slug, slug: sheet.slug }),
      staleTime: 'static',
    }),
  ])
  const currentSheet = current && (await queryClient.query({ ...datasheetSlugQuery(current.id, sheet.slug), staleTime: 'static' }))
  return {
    faction,
    sheet,
    canonical: current && currentSheet ? { faction: current, slug: currentSheet.slug } : { faction, slug: sheet.slug },
  }
}

export function factionDatasheetHead(loaderData: Awaited<ReturnType<typeof loadFactionDatasheet>> | undefined, origin: string) {
  if (!loaderData) return {}
  const { faction, sheet, canonical } = loaderData
  const path = factionReferenceHref(canonical.faction, `/datasheets/${canonical.slug}`)
  const { title, description } = datasheetPreview(sheet, faction.displayName)
  return pageHead(origin, {
    title,
    description,
    path,
    article: true,
    image: previewImage(`/datasheets/${faction.slug}/${sheet.slug}`, title),
    markdown: `/api/reference/v1/datasheets/${canonical.faction.id}/${canonical.slug}`,
    breadcrumbs: [
      { name: 'Factions', path: '/factions' },
      { name: canonical.faction.displayName, path: factionReferenceHref(canonical.faction) },
      { name: sheet.name, path },
    ],
  })
}

export async function loadFactionDetachment(queryClient: QueryClient, catalogueId: string, detachmentId: string, rules?: string) {
  const [faction] = await Promise.all([
    loadReferenceFaction(queryClient, catalogueId, rules),
    queryClient.query({ ...favouriteDetachmentsQuery(), staleTime: 'static' }),
  ])
  if (!faction) throw notFound()
  const route = faction.detachments.find((detachment) => detachment.slug === detachmentId)?.referenceRoute
  if (route && (route.catalogueId !== faction.slug || route.slug !== detachmentId))
    throw redirect({
      to: '/factions/$catalogueId/detachments/$detachmentId',
      params: { catalogueId: route.catalogueId, detachmentId: route.slug },
      replace: true,
    })
  const [detachment, current] = await Promise.all([
    queryClient.query({ ...detachmentDetailQuery(faction.id, detachmentId), staleTime: 'static' }),
    currentFactionFor(queryClient, faction),
  ])
  if (!detachment) throw notFound()
  const published = current?.detachments.some(
    ({ referenceRoute }) => referenceRoute?.catalogueId === current.slug && referenceRoute.slug === detachmentId,
  )
  return { detachment, faction, canonical: current && published ? current : faction }
}

export function factionDetachmentHead(
  loaderData: Awaited<ReturnType<typeof loadFactionDetachment>> | undefined,
  origin: string,
  detachmentId: string,
) {
  if (!loaderData) return {}
  const { detachment, faction, canonical } = loaderData
  const path = factionReferenceHref(canonical, `/detachments/${detachmentId}`)
  const { title, description } = detachmentPreview(detachment.name, faction.displayName)
  return pageHead(origin, {
    title,
    description,
    path,
    article: true,
    image: previewImage(`/detachments/${faction.slug}/${detachmentId}`, title),
    markdown: `/api/reference/v1/detachments/${canonical.id}/${detachmentId}`,
    breadcrumbs: [
      { name: 'Factions', path: '/factions' },
      { name: canonical.displayName, path: factionReferenceHref(canonical) },
      { name: detachment.name, path },
    ],
  })
}

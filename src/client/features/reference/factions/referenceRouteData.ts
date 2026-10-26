import type { QueryClient } from '@tanstack/react-query'
import { notFound, redirect } from '@tanstack/react-router'
import { factionReferenceHref } from '../../../../core/factionReferenceRoute'
import { datasheetPreview, detachmentPreview, pageHead, previewImage } from '../../../linkPreview'
import {
  datasheetSlugQuery,
  detachmentDetailQuery,
  favouriteDetachmentsQuery,
  favouriteFactionsQuery,
  loadReferenceFaction,
  referenceChangesQuery,
  factionDatasheetsQuery,
} from '../../../queries'

export async function loadFactionPage(queryClient: QueryClient, catalogueId: string, rules?: string) {
  const [faction] = await Promise.all([
    loadReferenceFaction(queryClient, catalogueId, rules),
    queryClient.query({ ...favouriteFactionsQuery(), staleTime: 'static' }),
    queryClient.query({ ...favouriteDetachmentsQuery(), staleTime: 'static' }),
  ])
  if (!faction) throw notFound()
  return faction
}

export function factionPageHead(faction: Awaited<ReturnType<typeof loadFactionPage>> | undefined, origin: string) {
  return faction
    ? pageHead(origin, {
        title: faction.displayName,
        description: `${faction.displayName} army rules, detachments, datasheets, loadouts and points.`,
        path: factionReferenceHref(faction),
      })
    : {}
}

export async function loadFactionDatasheets(queryClient: QueryClient, catalogueId: string, rules?: string) {
  const faction = await loadReferenceFaction(queryClient, catalogueId, rules)
  if (!faction) throw notFound()
  await queryClient.query({ ...factionDatasheetsQuery(faction.id, ''), staleTime: 'static' })
  return faction
}

export function factionDatasheetsHead(faction: Awaited<ReturnType<typeof loadFactionDatasheets>> | undefined, origin: string) {
  return faction
    ? pageHead(origin, {
        title: `${faction.displayName} datasheets`,
        description: `${faction.displayName} datasheets, unit profiles, weapons, wargear and points.`,
        path: factionReferenceHref(faction, '/datasheets'),
        breadcrumbs: [
          { name: 'Factions', path: '/factions' },
          { name: faction.displayName, path: factionReferenceHref(faction) },
          { name: 'Datasheets', path: factionReferenceHref(faction, '/datasheets') },
        ],
      })
    : {}
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
  await queryClient.query({
    ...referenceChangesQuery({ kind: 'datasheet', faction: faction.slug, slug: sheet.slug }),
    staleTime: 'static',
  })
  return { faction, sheet }
}

export function factionDatasheetHead(loaderData: Awaited<ReturnType<typeof loadFactionDatasheet>> | undefined, origin: string) {
  if (!loaderData) return {}
  const { faction, sheet } = loaderData
  const path = factionReferenceHref(faction, `/datasheets/${sheet.slug}`)
  const { title, description } = datasheetPreview(sheet, faction.displayName)
  return pageHead(origin, {
    title,
    description,
    path,
    article: true,
    image: previewImage(`/datasheets/${faction.slug}/${sheet.slug}`, title),
    markdown: `/api/reference/v1/datasheets/${faction.id}/${sheet.slug}`,
    breadcrumbs: [
      { name: 'Factions', path: '/factions' },
      { name: faction.displayName, path: factionReferenceHref(faction) },
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
  const detachment = await queryClient.query({ ...detachmentDetailQuery(faction.id, detachmentId), staleTime: 'static' })
  if (!detachment) throw notFound()
  return { detachment, faction }
}

export function factionDetachmentHead(
  loaderData: Awaited<ReturnType<typeof loadFactionDetachment>> | undefined,
  origin: string,
  detachmentId: string,
) {
  if (!loaderData) return {}
  const { detachment, faction } = loaderData
  const path = factionReferenceHref(faction, `/detachments/${detachmentId}`)
  const { title, description } = detachmentPreview(detachment.name, faction.displayName)
  return pageHead(origin, {
    title,
    description,
    path,
    article: true,
    image: previewImage(`/detachments/${faction.slug}/${detachmentId}`, title),
    markdown: `/api/reference/v1/detachments/${faction.id}/${detachmentId}`,
    breadcrumbs: [
      { name: 'Factions', path: '/factions' },
      { name: faction.displayName, path: factionReferenceHref(faction) },
      { name: detachment.name, path },
    ],
  })
}

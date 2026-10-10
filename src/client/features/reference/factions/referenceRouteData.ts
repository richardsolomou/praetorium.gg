import type { QueryClient } from '@tanstack/react-query'
import { notFound } from '@tanstack/react-router'
import { factionReferenceHref } from '../../../../core/factionReferenceRoute'
import { breadcrumbMeta, datasheetPreview, detachmentPreview, pageHead } from '../../../linkPreview'
import {
  datasheetSlugQuery,
  detachmentDetailQuery,
  favouriteDetachmentsQuery,
  loadReferenceFaction,
  referenceChangesQuery,
} from '../../../queries'

export async function loadFactionDatasheet(queryClient: QueryClient, catalogueId: string, entryId: string, rules?: string) {
  const faction = await loadReferenceFaction(queryClient, catalogueId, rules)
  if (!faction) throw notFound()
  const sheet = await queryClient.query({ ...datasheetSlugQuery(faction.id, entryId), staleTime: 'static' })
  if (!sheet) throw notFound()
  await queryClient.query({
    ...referenceChangesQuery({ kind: 'datasheet', faction: faction.slug, slug: sheet.slug }),
    staleTime: 'static',
  })
  return { faction, sheet }
}

export function factionDatasheetHead(loaderData: Awaited<ReturnType<typeof loadFactionDatasheet>> | undefined, origin: string) {
  if (!loaderData) return {}
  const { faction, sheet } = loaderData
  const factionPath = factionReferenceHref(faction)
  const path = factionReferenceHref(faction, `/datasheets/${sheet.slug}`)
  const { title, description } = datasheetPreview(sheet, faction.displayName)
  const head = pageHead(origin, {
    title,
    description,
    path,
    article: true,
    image: { path: `/api/previews/datasheets/${faction.slug}/${sheet.slug}`, alt: title },
    markdown: `/api/reference/v1/datasheets/${faction.id}/${sheet.slug}`,
  })
  return {
    meta: [
      ...head.meta,
      breadcrumbMeta(origin, [
        { name: 'Factions', path: '/factions' },
        { name: faction.displayName, path: factionPath },
        { name: sheet.name, path },
      ]),
    ],
    links: head.links,
  }
}

export async function loadFactionDetachment(queryClient: QueryClient, catalogueId: string, detachmentId: string, rules?: string) {
  const [faction] = await Promise.all([
    loadReferenceFaction(queryClient, catalogueId, rules),
    queryClient.query({ ...favouriteDetachmentsQuery(), staleTime: 'static' }),
  ])
  if (!faction) throw notFound()
  const route = faction.detachments.find((detachment) => detachment.slug === detachmentId)?.referenceRoute
  if (route && (route.catalogueId !== faction.slug || route.slug !== detachmentId)) throw notFound()
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
  const head = pageHead(origin, {
    title,
    description,
    path,
    article: true,
    image: { path: `/api/previews/detachments/${faction.slug}/${detachmentId}`, alt: title },
    markdown: `/api/reference/v1/detachments/${faction.id}/${detachmentId}`,
  })
  return {
    meta: [
      ...head.meta,
      breadcrumbMeta(origin, [
        { name: 'Factions', path: '/factions' },
        { name: faction.displayName, path: factionReferenceHref(faction) },
        { name: detachment.name, path },
      ]),
    ],
    links: head.links,
  }
}

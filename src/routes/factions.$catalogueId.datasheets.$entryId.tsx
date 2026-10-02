import { createFileRoute, notFound } from '@tanstack/react-router'
import { FactionDatasheet } from '../client/features/reference/factions/FactionDatasheet'
import { breadcrumbMeta, datasheetPreview, pageHead } from '../client/linkPreview'
import { datasheetSlugQuery, factionQuery, referenceChangesQuery } from '../client/queries'

export const Route = createFileRoute('/factions/$catalogueId/datasheets/$entryId')({
  loader: async ({ context, params }) => {
    const faction = await context.queryClient.query({ ...factionQuery(params.catalogueId), staleTime: 'static' })
    if (!faction) throw notFound()
    const sheet = await context.queryClient.query({ ...datasheetSlugQuery(faction.id, params.entryId), staleTime: 'static' })
    if (!sheet) throw notFound()
    await context.queryClient.query({
      ...referenceChangesQuery({ kind: 'datasheet', faction: faction.slug, slug: sheet.slug }),
      staleTime: 'static',
    })
    return { faction, sheet }
  },
  head: ({ loaderData, match }) => {
    if (!loaderData) return {}
    const { faction, sheet } = loaderData
    const origin = match.context.origin
    const factionPath = `/factions/${faction.slug}`
    const path = `${factionPath}/datasheets/${sheet.slug}`
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
  },
  component: FactionDatasheet,
})

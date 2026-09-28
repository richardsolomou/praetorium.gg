import { createFileRoute, notFound } from '@tanstack/react-router'
import { FactionDetachment } from '../client/features/reference/factions/FactionDetachment'
import { detachmentDetailQuery, factionQuery, favouriteDetachmentsQuery } from '../client/queries'
import { breadcrumbMeta, canonicalLink } from '../client/linkPreview'

export const Route = createFileRoute('/factions/$catalogueId/detachments/$detachmentId')({
  loader: async ({ context, params }) => {
    const [faction] = await Promise.all([
      context.queryClient.query({ ...factionQuery(params.catalogueId), staleTime: 'static' }),
      context.queryClient.query({ ...favouriteDetachmentsQuery(), staleTime: 'static' }),
    ])
    if (!faction) throw notFound()
    const detachment = await context.queryClient.query({ ...detachmentDetailQuery(faction.id, params.detachmentId), staleTime: 'static' })
    if (!detachment) throw notFound()
    return { detachment, faction }
  },
  head: ({ loaderData, match, params }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.detachment.name} detachment — ${loaderData.faction.displayName} — Praetorium` },
          {
            name: 'description',
            content: `${loaderData.detachment.name} rules, enhancements and stratagems for ${loaderData.faction.displayName}.`,
          },
          { property: 'og:title', content: `${loaderData.detachment.name} detachment` },
          {
            property: 'og:description',
            content: `${loaderData.detachment.name} rules, enhancements and stratagems for ${loaderData.faction.displayName}.`,
          },
          { property: 'og:type', content: 'article' },
          breadcrumbMeta(match.context.origin, [
            { name: 'Factions', path: '/factions' },
            { name: loaderData.faction.displayName, path: `/factions/${loaderData.faction.slug}` },
            { name: loaderData.detachment.name, path: `/factions/${loaderData.faction.slug}/detachments/${params.detachmentId}` },
          ]),
        ]
      : [],
    links: loaderData
      ? [canonicalLink(match.context.origin, `/factions/${loaderData.faction.slug}/detachments/${params.detachmentId}`)]
      : [],
  }),
  component: FactionDetachment,
})

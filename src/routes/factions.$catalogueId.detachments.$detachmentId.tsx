import { createFileRoute, notFound } from '@tanstack/react-router'
import { FactionDetachment } from '../client/components/FactionDetachment'
import { detachmentDetailQuery, factionQuery, favouriteDetachmentsQuery } from '../client/queries'

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
  head: ({ loaderData, params }) => ({
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
        ]
      : [],
    links: loaderData ? [{ rel: 'canonical', href: `/factions/${loaderData.faction.slug}/detachments/${params.detachmentId}` }] : [],
  }),
  component: FactionDetachment,
})

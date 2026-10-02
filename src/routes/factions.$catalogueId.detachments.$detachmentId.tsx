import { createFileRoute, notFound } from '@tanstack/react-router'
import { FactionDetachment } from '../client/features/reference/factions/FactionDetachment'
import { detachmentDetailQuery, factionQuery, favouriteDetachmentsQuery } from '../client/queries'
import { breadcrumbMeta, detachmentPreview, pageHead } from '../client/linkPreview'

export const Route = createFileRoute('/factions/$catalogueId/detachments/$detachmentId')({
  loader: async ({ context, params }) => {
    const [faction] = await Promise.all([
      context.queryClient.query({ ...factionQuery(params.catalogueId), staleTime: 'static' }),
      context.queryClient.query({ ...favouriteDetachmentsQuery(), staleTime: 'static' }),
    ])
    if (!faction) throw notFound()
    const route = faction.detachments.find((detachment) => detachment.slug === params.detachmentId)?.referenceRoute
    if (route && (route.catalogueId !== faction.slug || route.slug !== params.detachmentId)) throw notFound()
    const detachment = await context.queryClient.query({ ...detachmentDetailQuery(faction.id, params.detachmentId), staleTime: 'static' })
    if (!detachment) throw notFound()
    return { detachment, faction }
  },
  head: ({ loaderData, match, params }) => {
    if (!loaderData) return {}
    const { detachment, faction } = loaderData
    const origin = match.context.origin
    const path = `/factions/${faction.slug}/detachments/${params.detachmentId}`
    const { title, description } = detachmentPreview(detachment.name, faction.displayName)
    const head = pageHead(origin, {
      title,
      description,
      path,
      article: true,
      image: { path: `/api/previews/detachments/${faction.slug}/${params.detachmentId}`, alt: title },
      markdown: `/api/reference/v1/detachments/${faction.id}/${params.detachmentId}`,
    })
    return {
      meta: [
        ...head.meta,
        breadcrumbMeta(origin, [
          { name: 'Factions', path: '/factions' },
          { name: faction.displayName, path: `/factions/${faction.slug}` },
          { name: detachment.name, path },
        ]),
      ],
      links: head.links,
    }
  },
  component: FactionDetachment,
})

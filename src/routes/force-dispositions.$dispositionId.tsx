import { createFileRoute, notFound } from '@tanstack/react-router'
import { ForceDispositionPage } from '../client/features/reference/missions/ForceDispositionPage'
import { dispositionDetachmentsQuery, gameReferencesQuery } from '../client/queries'
import { pageHead } from '../client/linkPreview'

export const Route = createFileRoute('/force-dispositions/$dispositionId')({
  loader: async ({ context, params }) => {
    const [data] = await Promise.all([
      context.queryClient.query({ ...gameReferencesQuery(), staleTime: 'static' }),
      context.queryClient.query({ ...dispositionDetachmentsQuery(params.dispositionId), staleTime: 'static' }),
    ])
    const disposition = data?.dispositions.find((entry) => entry.id === params.dispositionId)
    if (!disposition) throw notFound()
    return { name: disposition.name }
  },
  head: ({ loaderData, match, params }) =>
    loaderData
      ? pageHead(match.context.origin, {
          title: `${loaderData.name} force disposition`,
          description: `${loaderData.name} primary missions by opposing force disposition, and the detachments that offer it.`,
          path: `/force-dispositions/${params.dispositionId}`,
          article: true,
        })
      : {},
  component: () => <ForceDispositionPage dispositionId={Route.useParams().dispositionId} />,
})

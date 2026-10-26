import { createFileRoute } from '@tanstack/react-router'
import { ForceDispositionIndexPage } from '../client/features/reference/missions/ForceDispositionIndexPage'
import { dispositionDetachmentsQuery, gameReferencesQuery } from '../client/queries'
import { pageHead } from '../client/linkPreview'

export const Route = createFileRoute('/force-dispositions/')({
  loader: async ({ context }) => {
    const data = await context.queryClient.query({ ...gameReferencesQuery(), staleTime: 'static' })
    await Promise.all(
      (data?.dispositions ?? []).map((disposition) =>
        context.queryClient.query({ ...dispositionDetachmentsQuery(disposition.id), staleTime: 'static' }),
      ),
    )
  },
  head: ({ match }) =>
    pageHead(match.context.origin, {
      title: 'Force dispositions',
      description: 'Explore force dispositions and the primary missions they bring to a battle.',
      path: '/force-dispositions',
    }),
  component: ForceDispositionIndexPage,
})

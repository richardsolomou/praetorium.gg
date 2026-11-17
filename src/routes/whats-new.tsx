import { createFileRoute } from '@tanstack/react-router'
import { WhatsNewPage } from '../client/features/changes/WhatsNewPage'
import { pageHead } from '../client/linkPreview'
import { releaseNotesQuery } from '../client/queries'

export const Route = createFileRoute('/whats-new')({
  loader: ({ context }) => context.queryClient.query({ ...releaseNotesQuery(), staleTime: 'static' }),
  head: ({ match }) =>
    pageHead(match.context.origin, {
      title: "What's new",
      description: 'Recent changes to the Praetorium army builder, combat simulator and battle tracker.',
      path: '/whats-new',
    }),
  component: WhatsNewPage,
})

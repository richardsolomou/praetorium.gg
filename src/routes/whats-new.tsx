import { createFileRoute } from '@tanstack/react-router'
import { WhatsNewPage } from '../client/features/changes/WhatsNewPage'
import { pageHead } from '../client/linkPreview'
import { releaseNotesQuery } from '../client/queries'

export const Route = createFileRoute('/whats-new')({
  validateSearch: (search: Record<string, unknown>): { view?: 'features' } => ({
    view: search.view === 'features' ? 'features' : undefined,
  }),
  loader: ({ context }) => context.queryClient.query({ ...releaseNotesQuery(), staleTime: 'static' }),
  head: ({ match }) =>
    pageHead(match.context.origin, {
      title: "What's new",
      description: 'Recent changes to the Praetorium army builder, combat simulator and battle tracker.',
      path: '/whats-new',
    }),
  component: WhatsNewRoute,
})

function WhatsNewRoute() {
  return <WhatsNewPage view={Route.useSearch().view ?? 'all'} />
}

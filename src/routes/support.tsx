import { createFileRoute } from '@tanstack/react-router'
import { Support } from '../client/features/legal/Support'
import { pageHead } from '../client/linkPreview'
import { searchText } from '../client/searchParams'

export const Route = createFileRoute('/support')({
  // A reply email links here with the conversation it is about, which opens over the page.
  validateSearch: (search: Record<string, unknown>): { conversation?: string } => ({
    conversation: searchText(search.conversation),
  }),
  head: ({ match }) =>
    pageHead(match.context.origin, {
      title: 'Support',
      description: 'Get help with Praetorium, report a problem, or recover your account.',
      path: '/support',
    }),
  component: SupportRoute,
})

function SupportRoute() {
  return <Support conversation={Route.useSearch().conversation} />
}

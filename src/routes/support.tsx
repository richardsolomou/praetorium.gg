import { createFileRoute } from '@tanstack/react-router'
import { Support } from '../client/features/legal/Support'
import { pageHead } from '../client/linkPreview'
import { supportDraftSchema } from '../core/supportReport'

export const Route = createFileRoute('/support')({
  validateSearch: (search: Record<string, unknown>) => ({ page: supportDraftSchema.shape.page.catch('support').parse(search.page) }),
  head: ({ match }) =>
    pageHead(match.context.origin, {
      title: 'Support',
      description: 'Get help with the Praetorium web, iOS, and Android applications.',
      path: '/support',
    }),
  component: SupportRoute,
})

function SupportRoute() {
  const { page } = Route.useSearch()
  return <Support page={page} />
}

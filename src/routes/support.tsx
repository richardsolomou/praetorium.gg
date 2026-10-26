import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { openConversation } from '../client/features/feedback/support'
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
  const { conversation } = Route.useSearch()
  const navigate = useNavigate()
  useEffect(() => {
    if (!conversation) return
    openConversation(conversation)
    void navigate({ to: '/support', search: {}, replace: true })
  }, [conversation, navigate])
  return <Support />
}

import { createFileRoute } from '@tanstack/react-router'
import { DeleteAccount } from '../client/features/legal/DeleteAccount'
import { pageHead } from '../client/linkPreview'

export const Route = createFileRoute('/delete-account')({
  head: ({ match }) =>
    pageHead(match.context.origin, {
      title: 'Delete account',
      description: 'Permanently delete a Praetorium account and its associated data.',
      path: '/delete-account',
    }),
  component: DeleteAccount,
})

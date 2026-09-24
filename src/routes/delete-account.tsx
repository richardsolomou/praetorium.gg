import { createFileRoute } from '@tanstack/react-router'
import { DeleteAccount } from '../client/features/legal/DeleteAccount'

export const Route = createFileRoute('/delete-account')({
  head: () => ({
    meta: [
      { title: 'Delete account — Praetorium' },
      { name: 'description', content: 'Permanently delete a Praetorium account and its associated data.' },
    ],
  }),
  component: DeleteAccount,
})

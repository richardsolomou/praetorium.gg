import { createFileRoute, redirect } from '@tanstack/react-router'

/** Player pages from before accounts were battle identities; their ids name no account, so they open the people you play. */
export const Route = createFileRoute('/p/$playerId')({
  beforeLoad: () => {
    throw redirect({ to: '/friends', replace: true })
  },
})

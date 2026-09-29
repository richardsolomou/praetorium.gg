import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/mission-packs/$packId_/secondary-missions/$cardId')({
  beforeLoad: ({ params, location }) => {
    throw redirect({ to: '/missions/$packId/secondaries/$cardId', params, hash: location.hash, replace: true })
  },
})

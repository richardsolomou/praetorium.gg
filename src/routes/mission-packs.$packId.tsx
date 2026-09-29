import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/mission-packs/$packId')({
  beforeLoad: ({ params, location }) => {
    throw redirect({ to: '/missions/$packId', params, hash: location.hash, replace: true })
  },
})

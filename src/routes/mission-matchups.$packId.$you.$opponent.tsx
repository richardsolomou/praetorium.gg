import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/mission-matchups/$packId/$you/$opponent')({
  beforeLoad: ({ params, location }) => {
    throw redirect({ to: '/missions/$packId/matchups/$you/$opponent', params, hash: location.hash, replace: true })
  },
})

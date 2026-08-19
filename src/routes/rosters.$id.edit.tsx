import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/rosters/$id/edit')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/rosters/$id', params, replace: true })
  },
})

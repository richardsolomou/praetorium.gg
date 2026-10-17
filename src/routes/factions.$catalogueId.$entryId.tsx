import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/factions/$catalogueId/$entryId')({
  beforeLoad: ({ params, search }) => {
    throw redirect({ to: '/factions/$catalogueId/datasheets/$entryId', params, search, replace: true })
  },
})

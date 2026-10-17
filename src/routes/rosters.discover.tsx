import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/rosters/discover')({
  beforeLoad: ({ search }) => {
    throw redirect({ to: '/rosters', search: { ...search, view: 'public' }, replace: true })
  },
})

import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/rosters/new')({
  beforeLoad: () => {
    throw redirect({ to: '/rosters', search: { new: true }, replace: true })
  },
})

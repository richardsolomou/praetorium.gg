import { createFileRoute, redirect } from '@tanstack/react-router'
import { rosterStartSearch } from '../client/features/rosters/rosterStart'

export const Route = createFileRoute('/rosters/new')({
  validateSearch: (search) => rosterStartSearch({ ...search, new: true }),
  beforeLoad: ({ search }) => {
    throw redirect({ to: '/rosters', search, replace: true })
  },
})

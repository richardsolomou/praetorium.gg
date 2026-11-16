import { createFileRoute, redirect } from '@tanstack/react-router'

/** The import page before Import moved onto the rosters page. */
export const Route = createFileRoute('/rosters/import')({
  beforeLoad: () => {
    throw redirect({ to: '/rosters', replace: true })
  },
})

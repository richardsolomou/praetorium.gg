import { createFileRoute, redirect } from '@tanstack/react-router'

/** Roster links shared before rosters lived under /rosters, `?battle=` included. */
export const Route = createFileRoute('/r/$id')({
  beforeLoad: ({ params, location }) => {
    throw redirect({ href: `/rosters/${encodeURIComponent(params.id)}${location.searchStr}`, replace: true })
  },
})

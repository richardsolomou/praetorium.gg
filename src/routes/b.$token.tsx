import { createFileRoute, redirect } from '@tanstack/react-router'

/** Battle links shared before battles lived under /battles. */
export const Route = createFileRoute('/b/$token')({
  beforeLoad: ({ params, location }) => {
    throw redirect({ href: `/battles/${encodeURIComponent(params.token)}${location.searchStr}`, replace: true })
  },
})

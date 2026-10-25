import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/leagues/$token')({
  beforeLoad: ({ params, location }) => {
    throw redirect({ href: `/tournaments/${encodeURIComponent(params.token)}${location.searchStr}`, replace: true })
  },
})

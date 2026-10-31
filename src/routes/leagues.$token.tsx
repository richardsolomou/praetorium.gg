import { createFileRoute, redirect } from '@tanstack/react-router'

/** Leagues became groups; the tournaments route resolves an old league link, and the event its `?event=` names, to where it lives now. */
export const Route = createFileRoute('/leagues/$token')({
  beforeLoad: ({ params, location }) => {
    throw redirect({ href: `/tournaments/${encodeURIComponent(params.token)}${location.searchStr}`, replace: true })
  },
})

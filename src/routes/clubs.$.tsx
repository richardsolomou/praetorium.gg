import { createFileRoute, redirect } from '@tanstack/react-router'

/** Clubs became groups; every old club link, invites included, opens the same page under /groups. */
export const Route = createFileRoute('/clubs/$')({
  beforeLoad: ({ params, location }) => {
    throw redirect({ href: `/groups/${params._splat ?? ''}${location.searchStr}`, replace: true })
  },
})

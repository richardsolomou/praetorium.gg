import { createFileRoute, redirect } from '@tanstack/react-router'
import { readGuestDraft } from '../client/features/rosters/guestDraft'
import { NewRosterPage } from '../client/features/rosters/NewRosterPage'
import { pageMeta } from '../client/linkPreview'
import { factionIndexQuery, meQuery } from '../client/queries'

/**
 * Where a visitor builds a list, and where it is saved once they have an account.
 *
 * A player with nothing to claim is sent to their library, which is where a list
 * is created. Only the browser can see a visitor's draft, so a request the server
 * answers leaves that decision to the page.
 */
export const Route = createFileRoute('/rosters/new')({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.query({ ...meQuery(), staleTime: 'static' })
    if (me && typeof window !== 'undefined' && !readGuestDraft()) throw redirect({ to: '/rosters', replace: true })
  },
  loader: ({ context }) => context.queryClient.query({ ...factionIndexQuery(), staleTime: 'static' }),
  head: ({ match }) => ({
    meta: pageMeta(match.context.origin, {
      title: 'Roster builder',
      description: 'Build a Warhammer 40,000 army list with points and legality checked as you go.',
      path: '/rosters/new',
    }),
  }),
  component: NewRosterPage,
})

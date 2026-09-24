import { createFileRoute } from '@tanstack/react-router'
import { Home } from '../client/features/home/Home'
import {
  battlesQuery,
  factionIndexQuery,
  friendBattlesQuery,
  friendshipsQuery,
  leaguesQuery,
  meQuery,
  publicBattlesQuery,
  savedRosterStatusQuery,
  savedRosterSummariesQuery,
  savedRosterTotalsQuery,
  standingsQuery,
} from '../client/queries'

/**
 * Everything the home page shows is on it at first paint.
 *
 * The feeds are the page rather than an afterthought below it, so fetching them
 * after hydration would leave the first frame a band over empty space and then
 * move it. A visitor with no account still gets the public feed, because that is
 * what says the instance is being played — and its first battle is the hero. A
 * player's lists and what is waiting on them are here for the same reason.
 */
export const Route = createFileRoute('/')({
  loader: async ({ context }) => {
    const me = await context.queryClient.query({ ...meQuery(), staleTime: 'static' })
    await Promise.all([
      context.queryClient.infiniteQuery({ ...publicBattlesQuery(), staleTime: 'static' }),
      ...(me
        ? [
            context.queryClient.infiniteQuery({ ...battlesQuery(), staleTime: 'static' }),
            context.queryClient.infiniteQuery({ ...friendBattlesQuery(), staleTime: 'static' }),
            context.queryClient.query({ ...savedRosterSummariesQuery(), staleTime: 'static' }),
            context.queryClient.query({ ...savedRosterTotalsQuery(), staleTime: 'static' }),
            context.queryClient.query({ ...savedRosterStatusQuery(), staleTime: 'static' }),
            context.queryClient.query({ ...factionIndexQuery(), staleTime: 'static' }),
            context.queryClient.query({ ...leaguesQuery(), staleTime: 'static' }),
            context.queryClient.query({ ...friendshipsQuery(), staleTime: 'static' }),
          ]
        : [context.queryClient.query({ ...standingsQuery(), staleTime: 'static' })]),
    ])
  },
  // The instance's own title and card are the home page's; only its address is its own.
  head: ({ match }) => ({ meta: [{ property: 'og:url', content: `${match.context.origin}/` }] }),
  component: Home,
})

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

/** Fetch home feeds in the loader so the first frame has its final layout. */
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

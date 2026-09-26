import { createFileRoute } from '@tanstack/react-router'
import { Home } from '../client/features/home/Home'
import {
  battlesQuery,
  factionIndexQuery,
  friendBattlesQuery,
  friendshipsQuery,
  homeRostersQuery,
  leaguesQuery,
  meQuery,
  publicBattlesQuery,
  standingsQuery,
} from '../client/queries'

/** Fetch home feeds in the loader so the first frame has its final layout. */
export const Route = createFileRoute('/')({
  loader: async ({ context }) => {
    const startedAt = performance.now()
    const durations: Record<string, number> = {}
    const timed = async <T,>(name: string, work: Promise<T>) => {
      const started = performance.now()
      try {
        return await work
      } finally {
        durations[name] = Math.round(performance.now() - started)
      }
    }
    await Promise.all([
      timed('publicBattles', context.queryClient.infiniteQuery({ ...publicBattlesQuery(), staleTime: 'static' })),
      timed('me', context.queryClient.query({ ...meQuery(), staleTime: 'static' })).then((me) =>
        Promise.all(
          me
            ? [
                timed('myBattles', context.queryClient.infiniteQuery({ ...battlesQuery(), staleTime: 'static' })),
                timed('friendBattles', context.queryClient.infiniteQuery({ ...friendBattlesQuery(), staleTime: 'static' })),
                timed('homeRosters', context.queryClient.query({ ...homeRostersQuery(), staleTime: 'static' })),
                timed('factionIndex', context.queryClient.query({ ...factionIndexQuery(), staleTime: 'static' })),
                timed('leagues', context.queryClient.query({ ...leaguesQuery(), staleTime: 'static' })),
                timed('friendships', context.queryClient.query({ ...friendshipsQuery(), staleTime: 'static' })),
              ]
            : [timed('standings', context.queryClient.query({ ...standingsQuery(), staleTime: 'static' }))],
        ),
      ),
    ])
    if (import.meta.env.SSR && performance.now() - startedAt > 1000) {
      console.warn({ event: 'slow_home_loader', duration_ms: Math.round(performance.now() - startedAt), queries_ms: durations })
    }
  },
  // The instance's own title and card are the home page's; only its address is its own.
  head: ({ match }) => ({ meta: [{ property: 'og:url', content: `${match.context.origin}/` }] }),
  component: Home,
})

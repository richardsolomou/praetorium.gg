import { createFileRoute } from '@tanstack/react-router'
import { Home } from '../client/components/home/Home'
import { battlesQuery, friendBattlesQuery, meQuery, publicBattlesQuery } from '../client/queries'

/**
 * Everything the home page shows is on it at first paint.
 *
 * The feeds are the page rather than an afterthought below it, so fetching them
 * after hydration would leave the first frame a band over empty space and then
 * move it. A visitor with no account still gets the public feed and the
 * standings, because those are what say the instance is being played — and the
 * first of them is the battle in the hero.
 */
export const Route = createFileRoute('/')({
  loader: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery())
    await Promise.all([
      context.queryClient.ensureInfiniteQueryData(publicBattlesQuery()),
      ...(me
        ? [context.queryClient.ensureInfiniteQueryData(battlesQuery()), context.queryClient.ensureInfiniteQueryData(friendBattlesQuery())]
        : []),
    ])
  },
  component: Home,
})

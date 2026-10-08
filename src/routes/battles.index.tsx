import { createFileRoute } from '@tanstack/react-router'
import { BattlesPage } from '../client/features/battles/BattlesPage'
import { battlesQuery, meQuery, publicBattlesQuery } from '../client/queries'
import { pageHead } from '../client/linkPreview'

export const Route = createFileRoute('/battles/')({
  loader: async ({ context }) => {
    const me = await context.queryClient.query({ ...meQuery(), staleTime: 'static' })
    await context.queryClient.infiniteQuery({ ...(me ? battlesQuery() : publicBattlesQuery()), staleTime: 'static' })
  },
  head: ({ match }) =>
    pageHead(match.context.origin, {
      title: 'Warhammer 40,000 battle tracker',
      description:
        'Track Warhammer 40,000 phases, scores and command points with friends, play practice games, and watch or replay public battles.',
      path: '/battles',
    }),
  component: BattlesPage,
})

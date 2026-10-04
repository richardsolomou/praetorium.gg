import { createFileRoute } from '@tanstack/react-router'
import { BattlesPage } from '../client/features/battles/BattlesPage'
import { battlesQuery, meQuery, publicBattlesQuery } from '../client/queries'

export const Route = createFileRoute('/battles/')({
  loader: async ({ context }) => {
    const me = await context.queryClient.query({ ...meQuery(), staleTime: 'static' })
    await context.queryClient.infiniteQuery({ ...(me ? battlesQuery() : publicBattlesQuery()), staleTime: 'static' })
  },
  component: BattlesPage,
})

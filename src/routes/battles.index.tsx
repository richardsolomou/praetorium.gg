import { createFileRoute } from '@tanstack/react-router'
import { BattlesPage } from '../client/features/battles/BattlesPage'
import { battlesQuery, meQuery } from '../client/queries'

export const Route = createFileRoute('/battles/')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.query({ ...meQuery(), staleTime: 'static' }),
      context.queryClient.infiniteQuery({ ...battlesQuery(), staleTime: 'static' }),
    ]),
  component: BattlesPage,
})

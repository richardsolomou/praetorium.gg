import { createFileRoute } from '@tanstack/react-router'
import { factionIndexQuery, favouriteFactionsQuery } from '../client/queries'
import { pageHead } from '../client/linkPreview'
import { FactionIndexPage } from '../client/features/reference/factions/FactionIndexPage'

export const Route = createFileRoute('/factions/')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.query({ ...factionIndexQuery(), staleTime: 'static' }),
      context.queryClient.query({ ...favouriteFactionsQuery(), staleTime: 'static' }),
    ]),
  head: ({ match }) =>
    pageHead(match.context.origin, {
      title: 'Factions',
      description: 'Browse Warhammer 40,000 faction rules, detachments, datasheets, loadouts and points.',
      path: '/factions',
    }),
  component: FactionIndexPage,
})

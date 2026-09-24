import { createFileRoute, Outlet, useRouterState } from '@tanstack/react-router'
import { factionIndexQuery, favouriteFactionsQuery } from '../client/queries'
import { pageMeta } from '../client/linkPreview'
import { FactionIndexPage } from '../client/features/reference/factions/FactionIndexPage'

export const Route = createFileRoute('/factions')({
  loader: ({ context, location }) =>
    location.pathname === '/factions'
      ? Promise.all([
          context.queryClient.query({ ...factionIndexQuery(), staleTime: 'static' }),
          context.queryClient.query({ ...favouriteFactionsQuery(), staleTime: 'static' }),
        ])
      : undefined,
  head: ({ match, matches }) => ({
    meta:
      matches.at(-1)?.routeId === match.routeId
        ? pageMeta(match.context.origin, {
            title: 'Factions',
            description: 'Browse Warhammer 40,000 faction rules, detachments, datasheets, loadouts and points.',
            path: '/factions',
          })
        : [],
  }),
  component: Factions,
})

function Factions() {
  const path = useRouterState({ select: (state) => state.location.pathname })
  if (path !== '/factions') return <Outlet />
  return <FactionIndexPage />
}

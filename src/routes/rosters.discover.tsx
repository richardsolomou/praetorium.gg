import { createFileRoute } from '@tanstack/react-router'
import { RULES_VERSION_STATUSES, type RulesVersionStatus } from '../core/rosterDiscovery'
import { discoveryFilter, RosterDiscoveryPage, type RosterDiscoverySearch } from '../client/features/rosters/RosterDiscoveryPage'
import { pageHead } from '../client/linkPreview'
import { discoveredRostersQuery, factionIndexQuery } from '../client/queries'

const searchText = (value: unknown) => (typeof value === 'string' && value && value.length <= 128 ? value : undefined)

export const Route = createFileRoute('/rosters/discover')({
  validateSearch: (search: Record<string, unknown>): RosterDiscoverySearch => {
    const faction = searchText(search.faction)
    const detachment = faction ? searchText(search.detachment) : undefined
    const rules = RULES_VERSION_STATUSES.find((status): status is RulesVersionStatus => status === search.rules)
    return { ...(faction ? { faction } : {}), ...(detachment ? { detachment } : {}), ...(rules ? { rules } : {}) }
  },
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const index = await context.queryClient.query({ ...factionIndexQuery(), staleTime: 'static' })
    await context.queryClient.infiniteQuery({
      ...discoveredRostersQuery(discoveryFilter(deps, index?.factions ?? [])),
      staleTime: 'static',
    })
  },
  head: ({ match }) =>
    pageHead(match.context.origin, {
      title: 'Discover Warhammer 40,000 armies',
      description:
        'Browse Warhammer 40,000 army lists other players published, filter them by faction, detachment and rules version, and duplicate one to edit.',
      path: '/rosters/discover',
    }),
  component: RosterDiscoveryRoute,
})

function RosterDiscoveryRoute() {
  return <RosterDiscoveryPage search={Route.useSearch()} />
}

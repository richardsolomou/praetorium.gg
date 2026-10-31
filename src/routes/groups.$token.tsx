import { createFileRoute, notFound } from '@tanstack/react-router'
import { GroupPage } from '../client/features/groups/GroupPage'
import { groupQuery, groupLeagueQuery, groupStandingsQuery, deploymentsQuery, sealedEventQuery } from '../client/queries'
import { GROUP_TABS, type GroupTab } from '../client/features/groups/group'
import { searchText } from '../client/searchParams'

/** The most hidden-list games whose details load with the page; the newest come first, and only those in play need them. */
const PRELOADED_GAMES = 5

export const Route = createFileRoute('/groups/$token')({
  validateSearch: (search: Record<string, unknown>): { game?: string; tab?: GroupTab } => ({
    game: searchText(search.game),
    tab: GROUP_TABS.find((tab) => tab === search.tab),
  }),
  // The games and the table are read with the group, so the page arrives whole rather than filling in and shifting.
  loader: async ({ context, params }) => {
    const [group] = await Promise.all([
      context.queryClient.query({ ...groupQuery(params.token), staleTime: 'static' }),
      context.queryClient.query({ ...groupStandingsQuery(params.token), staleTime: 'static' }).catch(() => null),
      context.queryClient.query({ ...groupLeagueQuery(params.token), staleTime: 'static' }).catch(() => null),
      context.queryClient.query({ ...deploymentsQuery(), staleTime: 'static' }).catch(() => null),
    ])
    if (!group) throw notFound()
    await Promise.all(
      group.games
        .slice(0, PRELOADED_GAMES)
        .map((game) => context.queryClient.query({ ...sealedEventQuery(game.token), staleTime: 'static' }).catch(() => null)),
    )
  },
  component: GroupRoute,
})

function GroupRoute() {
  const { game, tab } = Route.useSearch()
  return <GroupPage token={Route.useParams().token} game={game} tab={tab} />
}

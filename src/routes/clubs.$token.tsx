import { createFileRoute, notFound } from '@tanstack/react-router'
import { ClubPage } from '../client/features/clubs/ClubPage'
import { clubQuery, clubSeasonQuery, clubStandingsQuery, deploymentsQuery, leagueQuery } from '../client/queries'
import { CLUB_TABS, type ClubTab } from '../client/features/clubs/club'
import { searchText } from '../client/searchParams'

/** The most sealed games whose details load with the page; the newest come first, and only those in play need them. */
const PRELOADED_GAMES = 5

export const Route = createFileRoute('/clubs/$token')({
  validateSearch: (search: Record<string, unknown>): { game?: string; tab?: ClubTab } => ({
    game: searchText(search.game),
    tab: CLUB_TABS.find((tab) => tab === search.tab),
  }),
  // The games and the table are read with the club, so the page arrives whole rather than filling in and shifting.
  loader: async ({ context, params }) => {
    const [club] = await Promise.all([
      context.queryClient.query({ ...clubQuery(params.token), staleTime: 'static' }),
      context.queryClient.query({ ...clubStandingsQuery(params.token), staleTime: 'static' }).catch(() => null),
      context.queryClient.query({ ...clubSeasonQuery(params.token), staleTime: 'static' }).catch(() => null),
      context.queryClient.query({ ...deploymentsQuery(), staleTime: 'static' }).catch(() => null),
    ])
    if (!club) throw notFound()
    await Promise.all(
      club.games
        .slice(0, PRELOADED_GAMES)
        .map((game) => context.queryClient.query({ ...leagueQuery(game.token), staleTime: 'static' }).catch(() => null)),
    )
  },
  component: ClubRoute,
})

function ClubRoute() {
  const { game, tab } = Route.useSearch()
  return <ClubPage token={Route.useParams().token} game={game} tab={tab} />
}

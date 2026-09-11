import { createFileRoute } from '@tanstack/react-router'
import { ROSTER_VISIBILITIES, type RosterVisibility } from '../core/savedRoster'
import { GAME_SIZES } from '../core/battle'
import { ROSTER_SORTS, type RosterSort } from '../client/features/rosters/rosterSort'
import { RosterLibraryPage, type RosterLibrarySearch } from '../client/features/rosters/RosterLibraryPage'
import { meQuery } from '../client/queries'

export const Route = createFileRoute('/rosters/')({
  validateSearch: (search: Record<string, unknown>): RosterLibrarySearch => {
    const limit = Number(search.limit)
    const faction = typeof search.faction === 'string' && search.faction.length <= 128 ? search.faction : undefined
    const visibility =
      typeof search.visibility === 'string' && ROSTER_VISIBILITIES.includes(search.visibility as RosterVisibility)
        ? (search.visibility as RosterVisibility)
        : undefined
    const sort =
      typeof search.sort === 'string' && ROSTER_SORTS.includes(search.sort as RosterSort) ? (search.sort as RosterSort) : undefined
    return {
      ...(GAME_SIZES.some((size) => size.limit === limit) ? { limit } : {}),
      ...(faction ? { faction } : {}),
      ...(visibility ? { visibility } : {}),
      ...(sort && sort !== 'created-desc' ? { sort } : {}),
    }
  },
  loader: async ({ context }) => {
    await context.queryClient.query({ ...meQuery(), staleTime: 'static' })
  },
  component: RosterLibraryRoute,
})

function RosterLibraryRoute() {
  return <RosterLibraryPage search={Route.useSearch()} />
}

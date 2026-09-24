import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import {
  battlesFrom,
  battlesQuery,
  factionIndexQuery,
  friendBattlesQuery,
  friendshipsQuery,
  leaguesQuery,
  meQuery,
  publicBattlesQuery,
  savedRosterStatusQuery,
  savedRosterSummariesQuery,
  savedRosterTotalsQuery,
  standingsQuery,
} from '../../queries'
import { useLiveBattles } from '../../useLiveBattle'
import type { Battle } from '../battles/battle'
import { CreateBattle } from '../battles/CreateBattle'
import { DeleteBattleDialog } from '../battles/DeleteBattle'
import { sortRosters } from '../rosters/rosterSort'
import type { HomeRoster } from './HomeRosters'
import { HomeView } from './HomeView'

/**
 * The home page, reading everything the route loader already put in the cache.
 *
 * Only this half knows there is a server. `HomeView` is handed its data and the
 * one control that mutates anything, so the page can be drawn from fixtures at
 * every width and state without a database behind it.
 */
export function Home() {
  const { data: me } = useQuery(meQuery())
  const signedIn = Boolean(me)
  const { data: mine } = useInfiniteQuery({ ...battlesQuery(), enabled: signedIn })
  const { data: friends } = useInfiniteQuery({ ...friendBattlesQuery(), enabled: signedIn })
  const { data: open, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery(publicBattlesQuery())
  const { data: saved = [] } = useQuery({ ...savedRosterSummariesQuery(), enabled: signedIn })
  const { data: totals = [] } = useQuery({ ...savedRosterTotalsQuery(), enabled: signedIn })
  const { data: status = [] } = useQuery({ ...savedRosterStatusQuery(), enabled: signedIn })
  const { data: factions } = useQuery({ ...factionIndexQuery(), enabled: signedIn })
  const { data: leagues = [] } = useQuery({ ...leaguesQuery(), enabled: signedIn })
  const { data: friendships } = useQuery({ ...friendshipsQuery(), enabled: signedIn })
  const { data: standings } = useQuery({ ...standingsQuery(), enabled: !signedIn })
  const totalsById = new Map(totals.map((entry) => [entry.id, entry]))
  const statusById = new Map(status.map((entry) => [entry.id, entry]))
  const rosters: HomeRoster[] = sortRosters(saved, 'updated-desc').map((roster) => ({
    roster,
    faction: factions?.factions.find((entry) => entry.id === roster.catalogueId),
    points: totalsById.get(roster.id)?.points,
    label: totalsById.get(roster.id)?.label,
    problem: statusById.get(roster.id)?.problem ?? null,
    changes: statusById.get(roster.id)?.changes ?? 0,
  }))
  // An accepted entry with no list in it, before the reveal that would seal the event without it.
  const rostersDue = leagues
    .filter((league) => league.ownEntry?.status === 'accepted' && !league.ownEntry.submitted && !league.revealedAt)
    .map((league) => ({ token: league.token, name: league.name }))
  const [deleting, setDeleting] = useState<Battle | null>(null)
  // Being added to a battle happens on someone else's device, so this page is told.
  useLiveBattles(signedIn)
  return (
    <>
      <HomeView
        me={me ?? null}
        mine={signedIn ? battlesFrom(mine) : []}
        friends={signedIn ? battlesFrom(friends) : []}
        open={battlesFrom(open)}
        rosters={signedIn ? rosters : []}
        rostersDue={signedIn ? rostersDue : []}
        friendRequests={signedIn ? (friendships?.incoming.length ?? 0) : 0}
        leaders={standings ? { rows: standings.overall.rows, days: standings.days } : null}
        newBattle={<CreateBattle />}
        onDelete={setDeleting}
        more={hasNextPage ? { pending: isFetchingNextPage, onShow: () => void fetchNextPage() } : null}
      />
      <DeleteBattleDialog battle={deleting} onClose={() => setDeleting(null)} />
    </>
  )
}

import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import {
  battlesFrom,
  battlesQuery,
  factionIndexQuery,
  friendBattlesQuery,
  friendshipsQuery,
  homeRostersQuery,
  leaguesQuery,
  meQuery,
  publicBattlesQuery,
  standingsQuery,
} from '../../queries'
import type { Battle } from '../battles/battle'
import { CreateBattle } from '../battles/CreateBattle'
import { DeleteBattleDialog } from '../battles/DeleteBattle'
import type { HomeRoster } from './HomeRosters'
import { HomeView } from './HomeView'
import { HomeNotifications } from './HomeNotifications'

/**
 * The home page, reading everything the route loader already put in the cache.
 *
 * Only this half knows there is a server. `HomeView` is handed its data and
 * controls, so the page can be drawn from fixtures at
 * every width and state without a database behind it.
 */
export function Home() {
  const { data: me } = useQuery(meQuery())
  const signedIn = Boolean(me)
  const { data: mine } = useInfiniteQuery({ ...battlesQuery(), enabled: signedIn })
  const { data: friends } = useInfiniteQuery({ ...friendBattlesQuery(), enabled: signedIn })
  const { data: open, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery(publicBattlesQuery())
  const { data: homeRosters } = useQuery({ ...homeRostersQuery(), enabled: signedIn })
  const { data: factions } = useQuery({ ...factionIndexQuery(), enabled: signedIn })
  const { data: leagues = [] } = useQuery({ ...leaguesQuery(), enabled: signedIn })
  const { data: friendships } = useQuery({ ...friendshipsQuery(), enabled: signedIn })
  const { data: standings } = useQuery({ ...standingsQuery(), enabled: !signedIn })
  const rosters: HomeRoster[] = (homeRosters?.rosters ?? []).map((entry) => ({
    ...entry,
    faction: factions?.factions.find((faction) => faction.id === entry.roster.catalogueId),
  }))
  // An accepted entry with no list in it, before the reveal that would seal the event without it.
  const rostersDue = leagues
    .filter((league) => league.ownEntry?.status === 'accepted' && !league.ownEntry.submitted && !league.revealedAt)
    .map((league) => ({ token: league.token, name: league.name }))
  const [deleting, setDeleting] = useState<Battle | null>(null)
  return (
    <>
      <HomeView
        me={me ?? null}
        mine={signedIn ? battlesFrom(mine) : []}
        friends={signedIn ? battlesFrom(friends) : []}
        open={battlesFrom(open)}
        rosters={signedIn ? rosters : []}
        rosterCount={signedIn ? (homeRosters?.count ?? 0) : 0}
        rostersDue={signedIn ? rostersDue : []}
        friendRequests={signedIn ? (friendships?.incoming.length ?? 0) : 0}
        leaders={standings ? { rows: standings.overall.rows, days: standings.days } : null}
        newBattle={<CreateBattle />}
        notifications={me && !me.impersonatedBy ? <HomeNotifications /> : null}
        onDelete={setDeleting}
        more={hasNextPage ? { pending: isFetchingNextPage, onShow: () => void fetchNextPage() } : null}
      />
      <DeleteBattleDialog battle={deleting} onClose={() => setDeleting(null)} />
    </>
  )
}

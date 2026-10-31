import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import {
  armyUpdatesQuery,
  battlesFrom,
  battlesQuery,
  factionIndexQuery,
  friendBattlesQuery,
  friendshipsQuery,
  homeRostersQuery,
  sealedEventsQuery,
  meQuery,
  onboardingQuery,
  playerProfileQuery,
  playerRankingsQuery,
  publicBattlesQuery,
  savedRosterChangedIdsQuery,
  standingsQuery,
} from '../../queries'
import type { Battle } from '../battles/battle'
import { CreateBattle } from '../battles/CreateBattle'
import { DeleteBattleDialog } from '../battles/DeleteBattle'
import { type ArmyUpdate, armySlugs } from './HomeArmyUpdates'
import type { HomeRoster } from './HomeRosters'
import { HomeView } from './HomeView'
import { HomeNotifications } from './HomeNotifications'
import { RecentSimulations } from '../simulator/RecentSimulations'

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
  const { data: open } = useInfiniteQuery(publicBattlesQuery())
  const { data: homeRosters } = useQuery({ ...homeRostersQuery(), enabled: signedIn })
  const { data: factions } = useQuery({ ...factionIndexQuery(), enabled: signedIn })
  const { data: sealedEvents = [] } = useQuery({ ...sealedEventsQuery(), enabled: signedIn })
  const { data: friendships } = useQuery({ ...friendshipsQuery(), enabled: signedIn })
  const { data: standings } = useQuery({ ...standingsQuery(), enabled: !signedIn })
  const { data: onboarding } = useQuery({ ...onboardingQuery(), enabled: signedIn })
  const profile = useQuery({ ...playerProfileQuery(me?.id ?? ''), enabled: signedIn, staleTime: 60_000 })
  const rankings = useQuery({ ...playerRankingsQuery(me?.id ?? ''), enabled: signedIn })
  const { data: changedRosters = [] } = useQuery({ ...savedRosterChangedIdsQuery(), enabled: Boolean(homeRosters?.count) })
  const rosters: HomeRoster[] = (homeRosters?.rosters ?? []).map((entry) => ({
    ...entry,
    faction: factions?.factions.find((faction) => faction.id === entry.roster.catalogueId),
  }))
  const armies = armySlugs(rosters.map((entry) => entry.faction))
  const { data: newestUpdates = [] } = useQuery({ ...armyUpdatesQuery(armies), enabled: signedIn && armies.length > 0 })
  const armyUpdates = newestUpdates.flatMap(({ slug, ...update }): ArmyUpdate[] => {
    const faction = rosters.find((entry) => entry.faction?.slug === slug)?.faction
    return faction ? [{ faction, ...update }] : []
  })
  // An accepted entry with no list in it, before the reveal that would seal the event without it.
  const rostersDue = sealedEvents.filter(
    (sealedEvent) => sealedEvent.ownEntry?.status === 'accepted' && !sealedEvent.ownEntry.submitted && !sealedEvent.revealedAt,
  )
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
        changedRosters={signedIn ? changedRosters.length : 0}
        armyUpdates={signedIn ? armyUpdates : []}
        record={
          profile.isError
            ? null
            : profile.data && !rankings.isPending
              ? { record: profile.data.record, rank: rankings.data?.overall ?? null }
              : undefined
        }
        onboarding={signedIn ? onboarding : undefined}
        leaders={standings ? { rows: standings.overall.rows, days: standings.days } : null}
        newBattle={<CreateBattle />}
        notifications={me && !me.impersonatedBy ? <HomeNotifications /> : null}
        recentSimulations={<RecentSimulations surface="home" limit={3} />}
        onDelete={setDeleting}
      />
      <DeleteBattleDialog battle={deleting} onClose={() => setDeleting(null)} />
    </>
  )
}

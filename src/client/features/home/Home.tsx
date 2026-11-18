import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import {
  battlesFrom,
  battlesQuery,
  friendBattlesQuery,
  friendshipsQuery,
  groupsQuery,
  homeGroupsQuery,
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
import { NewBattle } from '../battles/NewBattle'
import { DeleteBattleDialog } from '../battles/DeleteBattle'
import type { HomeRoster } from './HomeRosters'
import { ABANDONED_AFTER, HomeView, underWay } from './HomeView'
import { homeWidget } from './homeWidget'
import { setNativeHomeWidget } from '../../nativeBridge'
import { HomeNotifications } from './HomeNotifications'
import { ContinueGuestDraft } from '../rosters/ContinueGuestDraft'
import { ownEntryStatus } from '../sealedEvents/sealedEvent'
import type { HomeGroup, HomeTournament } from './HomeGroups'
import type { LeagueGameDue } from './HomeInProgress'
import { homeMemberships, summarisedGroups } from './homeRouteData'
import { hiddenListGameOpen } from '../../../core/group'

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
  const { data: sealedEvents = [] } = useQuery({ ...sealedEventsQuery(), enabled: signedIn })
  const { data: friendships } = useQuery({ ...friendshipsQuery(), enabled: signedIn })
  const { data: allGroups = [] } = useQuery({ ...groupsQuery(), enabled: signedIn })
  const { data: standings } = useQuery({ ...standingsQuery(), enabled: !signedIn })
  const { data: onboarding } = useQuery({ ...onboardingQuery(), enabled: signedIn })
  const profile = useQuery({ ...playerProfileQuery(me?.id ?? ''), enabled: signedIn, staleTime: 60_000 })
  const rankings = useQuery({ ...playerRankingsQuery(me?.id ?? ''), enabled: signedIn })
  const { data: changedRosters = [] } = useQuery({ ...savedRosterChangedIdsQuery(), enabled: Boolean(homeRosters?.count) })
  const rosters: HomeRoster[] = homeRosters?.rosters ?? []
  // An accepted entry with no list in it, before the reveal that would seal the event without it.
  const rostersDue = sealedEvents.filter(
    (sealedEvent) => sealedEvent.ownEntry?.status === 'accepted' && !sealedEvent.ownEntry.submitted && !sealedEvent.revealedAt,
  )
  const memberships = homeMemberships(allGroups)
  const summarised = summarisedGroups(memberships)
  const { data: summaries } = useQuery({ ...homeGroupsQuery(summarised), enabled: summarised.length > 0 })
  const summaryOf = new Map(summaries?.map((summary) => [summary.token, summary]))
  const groups = memberships.map(({ token, name, battleCount, lastBattleAt, ownMember }): HomeGroup => ({
    token,
    name,
    battles: battleCount,
    lastBattleAt,
    pending: ownMember?.status === 'pending',
    place: summaries ? (summaryOf.get(token)?.place ?? null) : undefined,
  }))
  const leagueGames = memberships.flatMap(({ token, name }): LeagueGameDue[] => {
    const fixture = summaryOf.get(token)?.fixture
    return fixture ? [{ groupToken: token, groupName: name, ...fixture }] : []
  })
  // A tournament the player was turned down for is not theirs, and one past its day of play is over.
  const [now] = useState(() => Date.now())
  const tournaments = sealedEvents.flatMap(({ token, tournament, ownEntry, revealedAt, playsAt, pastAt }): HomeTournament[] =>
    tournament && ownEntry && ownEntry.status !== 'rejected' && hiddenListGameOpen({ pastAt }, now)
      ? [{ token, name: tournament.name, playsAt, status: ownEntryStatus(ownEntry, Boolean(revealedAt)) }]
      : [],
  )
  const [deleting, setDeleting] = useState<Battle | null>(null)
  // The widget waits for every list it draws from, so it never shows a partial picture as everything there is.
  const widget =
    me === null
      ? null
      : me && mine && (!summarised.length || summaries)
        ? JSON.stringify(
            homeWidget(
              me.id,
              {
                games: battlesFrom(mine).filter((battle) => underWay(battle, now - ABANDONED_AFTER)),
                leagueGames,
                rostersDue,
                tournaments,
              },
              now,
            ),
          )
        : undefined
  useEffect(() => {
    if (widget !== undefined) setNativeHomeWidget(widget === null ? null : JSON.parse(widget))
  }, [widget])
  return (
    <>
      <HomeView
        me={me ?? null}
        mine={battlesFrom(mine)}
        friends={signedIn ? battlesFrom(friends) : []}
        open={battlesFrom(open)}
        rosters={rosters}
        rosterCount={homeRosters?.count ?? 0}
        rostersDue={rostersDue}
        friendRequests={friendships?.incoming.length ?? 0}
        changedRosters={new Set(changedRosters)}
        record={
          profile.isError
            ? null
            : profile.data && !rankings.isPending
              ? { record: profile.data.record, rank: rankings.data?.overall ?? null }
              : undefined
        }
        rivals={profile.data?.record.opponents ?? []}
        groups={groups}
        leagueGames={leagueGames}
        tournaments={tournaments}
        onboarding={onboarding}
        leaders={standings ? { rows: standings.overall.rows } : null}
        newBattle={<NewBattle variant="outline" />}
        notifications={me && !me.impersonatedBy ? <HomeNotifications /> : null}
        guestDraft={me ? null : <ContinueGuestDraft surface="home" className="mt-6 max-w-md" />}
        onDelete={setDeleting}
      />
      <DeleteBattleDialog battle={deleting} onClose={() => setDeleting(null)} />
    </>
  )
}

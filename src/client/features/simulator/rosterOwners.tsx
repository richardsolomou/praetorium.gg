import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import { rosterSourceKey, type SimulatorRosterSource } from '../../../contracts/simulatorState'
import { discoveredRostersQuery, friendLeagueRostersQuery, meQuery, savedRosterSummariesQuery } from '../../queries'

export type RosterOwner = { name: string; image?: string | null }

type FriendLeagueRoster = {
  leagueToken: string
  leagueName: string
  eventToken: string
  userId: string
  rosterName: string
  ownerName: string
  ownerImage?: string | null
}

/** A friend's sealed league list as the simulator links to it. */
export const friendLeagueSource = ({ leagueToken: token, eventToken, userId }: FriendLeagueRoster) => ({
  league: { token, eventToken, userId },
})

/** A friend's sealed league list named by list, player and tournament. */
export const friendLeagueLabel = (entry: FriendLeagueRoster) =>
  [entry.rosterName || 'Sealed roster', entry.ownerName, entry.leagueName].join(' · ')

type KnownRosters = {
  me: RosterOwner | null | undefined
  saved: readonly { id: string }[]
  friends: readonly { roster: { id: string }; owner: RosterOwner }[]
  leagues: readonly FriendLeagueRoster[]
}

/** Whose roster a simulator side comes from, among the rosters the simulator lists; a roster opened by someone else's link is unknown. */
export function rosterOwner(source: SimulatorRosterSource | undefined, known: KnownRosters): RosterOwner | undefined {
  if (!source) return undefined
  if ('league' in source) {
    const entry = known.leagues.find((candidate) => rosterSourceKey(friendLeagueSource(candidate)) === rosterSourceKey(source))
    return entry ? { name: entry.ownerName, image: entry.ownerImage } : undefined
  }
  if (known.me && known.saved.some((roster) => roster.id === source.id)) return known.me
  return known.friends.find(({ roster }) => roster.id === source.id)?.owner
}

/**
 * The rosters a simulator offers to pick from: the player's own, including archived ones,
 * the newest page of friends' public rosters as the roster library's Friends tab lists
 * them, and friends' revealed league lists.
 */
export function useSimulatorRosters(enabled = true) {
  const me = useQuery({ ...meQuery(), enabled })
  const signedIn = enabled && Boolean(me.data)
  const saved = useQuery({ ...savedRosterSummariesQuery(), enabled: signedIn })
  const friends = useInfiniteQuery({ ...discoveredRostersQuery({}, 'friends', 'updated-desc'), enabled: signedIn })
  const leagues = useQuery({ ...friendLeagueRostersQuery(), enabled: signedIn })
  return { me, saved, friendRosters: friends.data?.pages[0]?.rosters ?? [], leagueRosters: leagues.data ?? [] }
}

/** `rosterOwner` over the same reads the simulator's roster picker makes, so it adds no requests of its own. */
export function useRosterOwners() {
  const { me, saved, friendRosters, leagueRosters } = useSimulatorRosters()
  const known: KnownRosters = { me: me.data, saved: saved.data ?? [], friends: friendRosters, leagues: leagueRosters }
  return (source: SimulatorRosterSource | undefined) => rosterOwner(source, known)
}

/** Players' faces side by side, overlapping when there is more than one, as a pair's are. */
export function OwnerAvatars({ owners, className = 'size-5 text-3xs' }: { owners: readonly RosterOwner[]; className?: string }) {
  return (
    <span aria-hidden className="flex shrink-0 -space-x-1.5">
      {owners.map((owner) => (
        <PlayerAvatar key={owner.name} name={owner.name} image={owner.image} className={`${className} ring-2 ring-panel`} />
      ))}
    </span>
  )
}

/** A player's face and name, for whoever a roster belongs to. */
export function OwnerName({ owner, className = '' }: { owner: RosterOwner; className?: string }) {
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 ${className}`}>
      <OwnerAvatars owners={[owner]} />
      <span className="truncate">{owner.name}</span>
    </span>
  )
}

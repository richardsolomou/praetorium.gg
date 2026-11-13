import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import type { SimulatorRosterSource } from '../../../contracts/simulatorState'
import {
  discoveredRostersQuery,
  friendSealedEventRostersQuery,
  friendshipsQuery,
  meQuery,
  rostersLentToMeQuery,
  savedRosterSummariesQuery,
} from '../../queries'
import { nameColour } from '../../playerName'

export type RosterOwner = { id?: string; name: string; image?: string | null; colour?: string | null }

type FriendSealedEventRoster = {
  sealedEventToken: string
  sealedEventName: string
  eventToken: string
  userId: string
  rosterName: string
  ownerName: string
  ownerImage?: string | null
  ownerColour?: string | null
}

/** A friend's sealed list as the simulator links to it. */
export const friendSealedEventSource = ({ sealedEventToken: token, eventToken, userId }: FriendSealedEventRoster) => ({
  sealedEvent: { token, eventToken, userId },
})

/** A friend's sealed list named by list, player and tournament. */
export const friendSealedEventLabel = (entry: FriendSealedEventRoster) =>
  [entry.rosterName || 'Sealed roster', entry.ownerName, entry.sealedEventName].join(' · ')

type KnownRosters = {
  me: RosterOwner | null | undefined
  saved: readonly { id: string }[]
  friends: readonly { roster: { id: string }; owner: RosterOwner }[]
  people: readonly ({ id: string } & RosterOwner)[]
}

/**
 * Whose roster a simulator side comes from: the player's own, a friend's listed or lent roster, or a friend's sealed list,
 * whether or not its event is still on. A roster opened by someone else's link is unknown.
 */
export function rosterOwner(source: SimulatorRosterSource | undefined, known: KnownRosters): RosterOwner | undefined {
  if (!source) return undefined
  if ('sealedEvent' in source) {
    const friend = known.people.find((candidate) => candidate.id === source.sealedEvent.userId)
    return friend ? { id: friend.id, name: friend.name, image: friend.image, colour: friend.colour } : undefined
  }
  if (known.me && known.saved.some((roster) => roster.id === source.id)) return known.me
  return known.friends.find(({ roster }) => roster.id === source.id)?.owner
}

/**
 * The rosters a simulator offers to pick from: the player's own, including archived ones,
 * the newest page of friends' public rosters as the roster library's Friends tab lists
 * them, rosters friends have lent the player, and friends' revealed sealed lists from events still on.
 */
export function useSimulatorRosters(enabled = true) {
  const me = useQuery({ ...meQuery(), enabled })
  const signedIn = enabled && Boolean(me.data)
  const saved = useQuery({ ...savedRosterSummariesQuery(), enabled: signedIn })
  const friends = useInfiniteQuery({ ...discoveredRostersQuery({}, 'friends', 'updated-desc'), enabled: signedIn })
  const sealedEvents = useQuery({ ...friendSealedEventRostersQuery(), enabled: signedIn })
  const lent = useQuery({ ...rostersLentToMeQuery(), enabled: signedIn })
  const lentRosters = (lent.data ?? []).map(({ summary, owner }) => ({ roster: summary, owner }))
  // A lent roster that is also public is listed once, as lent.
  const lentIds = new Set(lentRosters.map(({ roster }) => roster.id))
  const friendRosters = (friends.data?.pages[0]?.rosters ?? []).filter(({ roster }) => !lentIds.has(roster.id))
  return { me, saved, friendRosters, lentRosters, sealedEventRosters: sealedEvents.data ?? [] }
}

/** `rosterOwner` over the simulator's roster picker reads and the player's friends. */
export function useRosterOwners() {
  const { me, saved, friendRosters, lentRosters } = useSimulatorRosters()
  const people = useQuery({ ...friendshipsQuery(), enabled: Boolean(me.data) })
  const known: KnownRosters = {
    me: me.data,
    saved: saved.data ?? [],
    friends: [...friendRosters, ...lentRosters],
    people: people.data?.friends ?? [],
  }
  return (source: SimulatorRosterSource | undefined) => rosterOwner(source, known)
}

/** Players' faces side by side, overlapping when there is more than one, as a pair's are. */
export function OwnerAvatars({ owners }: { owners: readonly RosterOwner[] }) {
  return (
    <span aria-hidden className="flex shrink-0 -space-x-1.5">
      {owners.map((owner) => (
        <PlayerAvatar key={owner.name} name={owner.name} image={owner.image} className="size-5 text-3xs ring-2 ring-panel" />
      ))}
    </span>
  )
}

/** A player's face and name, for whoever a roster belongs to. */
export function OwnerName({ owner, className = '' }: { owner: RosterOwner; className?: string }) {
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 ${className}`}>
      <OwnerAvatars owners={[owner]} />
      <span className="truncate" style={owner.id ? nameColour({ id: owner.id, colour: owner.colour }) : undefined}>
        {owner.name}
      </span>
    </span>
  )
}

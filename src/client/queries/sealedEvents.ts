import { queryOptions } from '@tanstack/react-query'
import {
  sealedEventResults,
  sealedEventRosterSharing,
  listFriendSealedEventRosters,
  listSealedEventBattles,
  listSealedEvents,
  openSealedEvent,
  openSealedEventRoster,
  outdatedSealedEventEntriesForRoster,
} from '../functions'
import { battleFeedQuery, feedKey } from './battles'
import { battleFilterActive, type BattleFilter, type BattleOrder } from '../../core/battleFilter'
import { SSR_STALE_TIME } from './shared'
import { squadMeetingChoosing } from '../../core/squad'
import {
  friendSealedEventRostersKey,
  sealedEventBattlesKey,
  sealedEventKey,
  sealedEventResultsKey,
  sealedEventRosterKey,
  sealedEventRosterSharingKey,
  sealedEventsKey,
  outdatedSealedEventEntriesKey,
} from './queryKeys'

export const sealedEventsQuery = () =>
  queryOptions({ queryKey: sealedEventsKey(), queryFn: () => listSealedEvents(), staleTime: SSR_STALE_TIME })

/** Friends' sealed lists from revealed events the player can open. */
export const friendSealedEventRostersQuery = () =>
  queryOptions({ queryKey: friendSealedEventRostersKey(), queryFn: () => listFriendSealedEventRosters(), staleTime: SSR_STALE_TIME })

export const sealedEventRosterSharingQuery = (token: string, eventToken: string, userId: string) =>
  queryOptions({
    queryKey: sealedEventRosterSharingKey(token, eventToken, userId),
    queryFn: () => sealedEventRosterSharing({ data: { token, eventToken } }),
    staleTime: SSR_STALE_TIME,
  })
export const outdatedSealedEventEntriesQuery = (rosterId: string) =>
  queryOptions({
    queryKey: outdatedSealedEventEntriesKey(rosterId),
    queryFn: () => outdatedSealedEventEntriesForRoster({ data: { rosterId } }),
    staleTime: SSR_STALE_TIME,
  })
/** Whether the reader is waiting on a team meeting's next reveal: their own team's, or any while they run the event. */
const awaitingPicks = (sealedEvent: {
  organizer: boolean
  teams: { size: number } | null
  squadMatches: { own: boolean; bId: string | null; revealed: unknown[] }[]
}) =>
  sealedEvent.squadMatches.some(
    (match) => (sealedEvent.organizer || match.own) && squadMeetingChoosing(match, sealedEvent.teams?.size ?? 0),
  )

export const sealedEventQuery = (token: string) =>
  queryOptions({
    queryKey: sealedEventKey(token),
    queryFn: () => openSealedEvent({ data: { token } }),
    staleTime: SSR_STALE_TIME,
    // A team's picks reveal when the other team chooses, which only a page polling sees as it happens.
    refetchInterval: ({ state }) => (state.data?.revealedAt && !awaitingPicks(state.data) ? false : 5_000),
  })

export const sealedEventRosterQuery = (token: string, eventToken: string | undefined, userId: string) =>
  queryOptions({
    queryKey: sealedEventRosterKey(token, eventToken, userId),
    queryFn: () => openSealedEventRoster({ data: { token, eventToken, userId } }),
    enabled: Boolean(token && userId),
    staleTime: Infinity,
  })

export const sealedEventBattlesQuery = (token: string, eventToken: string, filter?: BattleFilter, order?: BattleOrder) =>
  battleFeedQuery(
    feedKey(sealedEventBattlesKey(token, eventToken), filter, order),
    (before) => listSealedEventBattles({ data: { token, eventToken, before, filter, order } }),
    battleFilterActive(filter) || order ? undefined : 5_000,
  )

/** Under the sealed event's key, so every sealed event refresh also refreshes its table; battles finish less often than the list polls. */
export const sealedEventResultsQuery = (token: string, eventToken: string) =>
  queryOptions({
    queryKey: sealedEventResultsKey(token, eventToken),
    queryFn: () => sealedEventResults({ data: { token, eventToken } }),
    staleTime: SSR_STALE_TIME,
    refetchInterval: 30_000,
  })

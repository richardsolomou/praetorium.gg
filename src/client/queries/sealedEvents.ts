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
import { battleFeedQuery } from './battles'
import { SSR_STALE_TIME } from './shared'
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
export const sealedEventQuery = (token: string, eventToken?: string) =>
  queryOptions({
    queryKey: sealedEventKey(token, eventToken),
    queryFn: () => openSealedEvent({ data: { token, eventToken } }),
    staleTime: SSR_STALE_TIME,
    refetchInterval: ({ state }) => (state.data?.revealedAt ? false : 5_000),
  })

export const sealedEventRosterQuery = (token: string, eventToken: string | undefined, userId: string) =>
  queryOptions({
    queryKey: sealedEventRosterKey(token, eventToken, userId),
    queryFn: () => openSealedEventRoster({ data: { token, eventToken, userId } }),
    enabled: Boolean(token && userId),
    staleTime: Infinity,
  })

export const sealedEventBattlesQuery = (token: string, eventToken: string) =>
  battleFeedQuery(
    sealedEventBattlesKey(token, eventToken),
    (before) => listSealedEventBattles({ data: { token, eventToken, before } }),
    5_000,
  )

/** Under the sealed event's key, so every sealed event refresh also refreshes its table; battles finish less often than the list polls. */
export const sealedEventResultsQuery = (token: string, eventToken: string) =>
  queryOptions({
    queryKey: sealedEventResultsKey(token, eventToken),
    queryFn: () => sealedEventResults({ data: { token, eventToken } }),
    staleTime: SSR_STALE_TIME,
    refetchInterval: 30_000,
  })

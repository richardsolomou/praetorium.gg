import { captureAppSnapshot, reconcileAppAccount } from '../offline/appSnapshot'
import { clearSavedApp, writeAppSnapshot } from '../offline/appStorage'
import { infiniteQueryOptions, keepPreviousData, queryOptions, type QueryClient } from '@tanstack/react-query'
import type { AdminUsersRequest } from '../../admin'
import type { AdminCollectionPhotosCursor } from '../../contracts/collection'
import {
  abilityReminders,
  accountMethods,
  activeFriendInvite,
  adminPlayerBattles,
  adminUserConnections,
  adminUserSessions,
  adminUsers,
  friendInvite,
  githubSponsorship,
  mcpConnections,
  heldCollectionPhotos,
  adminCollectionPhotos,
  me,
  notificationSettings,
  onboardingProgress,
  playerDefaults,
  signInOptions,
  userProfile,
  collectionProfile,
} from '../functions'
import { SSR_STALE_TIME } from './shared'
import { anySignal } from '../abortSignals'
import {
  abilityRemindersKey,
  adminKey,
  collectionProfileKey,
  friendInviteKey,
  meKey,
  notificationSettingsKey,
  onboardingKey,
  playerDefaultsKey,
  userProfileKey,
} from './queryKeys'

export const meQuery = () =>
  queryOptions({
    queryKey: meKey(),
    queryFn: async ({ client, signal }) => {
      const user = await me({
        signal: anySignal([signal, AbortSignal.timeout(15_000)]),
        fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
      })
      signal.throwIfAborted()
      if (typeof window !== 'undefined' && reconcileAppAccount(client, user)) {
        client.setQueryData(meKey(), user)
        await clearSavedApp().catch(() => {})
        await writeAppSnapshot(captureAppSnapshot(client)).catch(() => {})
      }
      return user
    },
    staleTime: SSR_STALE_TIME,
  })
export const notificationSettingsQuery = () =>
  queryOptions({ queryKey: notificationSettingsKey(), queryFn: () => notificationSettings(), staleTime: SSR_STALE_TIME })
export const playerDefaultsQuery = () =>
  queryOptions({ queryKey: playerDefaultsKey(), queryFn: () => playerDefaults(), staleTime: SSR_STALE_TIME })
/** The player's ability alerts, which every roster they build and field applies. */
export const abilityRemindersQuery = () =>
  queryOptions({ queryKey: abilityRemindersKey(), queryFn: () => abilityReminders(), staleTime: SSR_STALE_TIME })
export const mcpConnectionsQuery = () => queryOptions({ queryKey: ['mcp-connections'], queryFn: () => mcpConnections() })
export const onboardingQuery = () =>
  queryOptions({ queryKey: onboardingKey(), queryFn: () => onboardingProgress(), staleTime: SSR_STALE_TIME })
export const activeFriendInviteQuery = () =>
  queryOptions({ queryKey: friendInviteKey('active'), queryFn: () => activeFriendInvite(), staleTime: SSR_STALE_TIME })
export const friendInviteQuery = (token: string) =>
  queryOptions({
    queryKey: friendInviteKey(token),
    queryFn: () => friendInvite({ data: { token } }),
    staleTime: SSR_STALE_TIME,
  })
export const accountMethodsQuery = () =>
  queryOptions({ queryKey: ['account-methods'], queryFn: () => accountMethods(), staleTime: SSR_STALE_TIME })
export const githubSponsorshipQuery = () =>
  queryOptions({ queryKey: ['github-sponsorship'], queryFn: () => githubSponsorship(), staleTime: SSR_STALE_TIME })
/**
 * Re-reads administration after a change. A fetch already in flight for a query with no data yet would
 * otherwise be reused, and it started before the change it is meant to show.
 */
export async function refreshAdminQueries(queryClient: QueryClient) {
  await queryClient.cancelQueries({ queryKey: adminKey() })
  await queryClient.invalidateQueries({ queryKey: adminKey() })
}
export const adminUsersQuery = (request: AdminUsersRequest) =>
  queryOptions({
    queryKey: [...adminKey(), 'users', request],
    queryFn: () => adminUsers({ data: request }),
    placeholderData: keepPreviousData,
    staleTime: SSR_STALE_TIME,
  })
export const adminUserSessionsQuery = (userId: string) =>
  queryOptions({ queryKey: [...adminKey(), 'sessions', userId], queryFn: () => adminUserSessions({ data: { userId } }) })
export const adminUserConnectionsQuery = (userId: string) =>
  queryOptions({ queryKey: [...adminKey(), 'connections', userId], queryFn: () => adminUserConnections({ data: { userId } }) })
export const adminPlayerBattlesQuery = (userId: string) =>
  queryOptions({ queryKey: [...adminKey(), 'player-battles', userId], queryFn: () => adminPlayerBattles({ data: { userId } }) })
export const heldCollectionPhotosQuery = () =>
  queryOptions({ queryKey: [...adminKey(), 'held-photos'], queryFn: () => heldCollectionPhotos() })
export const adminCollectionPhotosQuery = () =>
  infiniteQueryOptions({
    queryKey: [...adminKey(), 'photos'],
    queryFn: ({ pageParam }) => adminCollectionPhotos({ data: { before: pageParam } }),
    initialPageParam: null as AdminCollectionPhotosCursor | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  })

export const userProfileQuery = (userId: string) =>
  queryOptions({
    queryKey: userProfileKey(userId),
    queryFn: () => userProfile({ data: { userId } }),
    staleTime: SSR_STALE_TIME,
  })

export const signInOptionsQuery = () => queryOptions({ queryKey: ['sign-in-options'], queryFn: () => signInOptions(), staleTime: Infinity })

export const collectionProfileQuery = (userId: string) =>
  queryOptions({ queryKey: collectionProfileKey(userId), queryFn: () => collectionProfile({ data: { userId } }) })

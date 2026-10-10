import { captureAppSnapshot, reconcileAppAccount } from '../offline/appSnapshot'
import { clearSavedApp, writeAppSnapshot } from '../offline/appStorage'
import { infiniteQueryOptions, keepPreviousData, queryOptions, type QueryClient } from '@tanstack/react-query'
import type { AdminUserFilter, AdminUserSort, AdminUsersCursor } from '../../admin'
import {
  accountMethods,
  activeFriendInvite,
  adminPlayerBattles,
  adminUserConnections,
  adminUserSessions,
  adminUsers,
  friendInvite,
  githubSponsorship,
  me,
  notificationSettings,
  onboardingProgress,
  playerDefaults,
  signInOptions,
  userProfile,
} from '../functions'
import { SSR_STALE_TIME } from './shared'
import { anySignal } from '../abortSignals'

export const meQuery = () =>
  queryOptions({
    queryKey: ['me'],
    queryFn: async ({ client, signal }) => {
      const user = await me({
        signal: anySignal([signal, AbortSignal.timeout(15_000)]),
        fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
      })
      signal.throwIfAborted()
      if (typeof window !== 'undefined' && reconcileAppAccount(client, user)) {
        client.setQueryData(['me'], user)
        await clearSavedApp().catch(() => {})
        await writeAppSnapshot(captureAppSnapshot(client)).catch(() => {})
      }
      return user
    },
    staleTime: SSR_STALE_TIME,
  })
export const notificationSettingsQuery = () =>
  queryOptions({ queryKey: ['notification-settings'], queryFn: () => notificationSettings(), staleTime: SSR_STALE_TIME })
export const playerDefaultsQuery = () =>
  queryOptions({ queryKey: ['player-defaults'], queryFn: () => playerDefaults(), staleTime: SSR_STALE_TIME })
export const onboardingQuery = () =>
  queryOptions({ queryKey: ['onboarding'], queryFn: () => onboardingProgress(), staleTime: SSR_STALE_TIME })
export const activeFriendInviteQuery = () =>
  queryOptions({ queryKey: ['friend-invite', 'active'], queryFn: () => activeFriendInvite(), staleTime: SSR_STALE_TIME })
export const friendInviteQuery = (token: string) =>
  queryOptions({
    queryKey: ['friend-invite', token],
    queryFn: () => friendInvite({ data: { token } }),
    staleTime: SSR_STALE_TIME,
  })
export const accountMethodsQuery = () =>
  queryOptions({ queryKey: ['account-methods'], queryFn: () => accountMethods(), staleTime: SSR_STALE_TIME })
export const githubSponsorshipQuery = () =>
  queryOptions({ queryKey: ['github-sponsorship'], queryFn: () => githubSponsorship(), staleTime: SSR_STALE_TIME })
/** Every administration read sits under one key, so an administrator's change refreshes all of them. */
export const ADMIN_QUERY_KEY = ['admin'] as const

/**
 * Re-reads administration after a change. A fetch already in flight for a query with no data yet would
 * otherwise be reused, and it started before the change it is meant to show.
 */
export async function refreshAdminQueries(queryClient: QueryClient) {
  await queryClient.cancelQueries({ queryKey: ADMIN_QUERY_KEY })
  await queryClient.invalidateQueries({ queryKey: ADMIN_QUERY_KEY })
}
export const adminUsersQuery = (query: string, sort: AdminUserSort, filter: AdminUserFilter) =>
  infiniteQueryOptions({
    queryKey: [...ADMIN_QUERY_KEY, 'users', query, sort, filter],
    queryFn: ({ pageParam }) => adminUsers({ data: { query, sort, filter, cursor: pageParam } }),
    initialPageParam: null as AdminUsersCursor | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
    staleTime: SSR_STALE_TIME,
  })
export const adminUserSessionsQuery = (userId: string) =>
  queryOptions({ queryKey: [...ADMIN_QUERY_KEY, 'sessions', userId], queryFn: () => adminUserSessions({ data: { userId } }) })
export const adminUserConnectionsQuery = (userId: string) =>
  queryOptions({ queryKey: [...ADMIN_QUERY_KEY, 'connections', userId], queryFn: () => adminUserConnections({ data: { userId } }) })
export const adminPlayerBattlesQuery = (userId: string) =>
  queryOptions({ queryKey: [...ADMIN_QUERY_KEY, 'player-battles', userId], queryFn: () => adminPlayerBattles({ data: { userId } }) })

export const userProfileQuery = (userId: string) =>
  queryOptions({
    queryKey: ['user-profile', userId],
    queryFn: () => userProfile({ data: { userId } }),
    staleTime: SSR_STALE_TIME,
  })

export const signInOptionsQuery = () => queryOptions({ queryKey: ['sign-in-options'], queryFn: () => signInOptions(), staleTime: Infinity })

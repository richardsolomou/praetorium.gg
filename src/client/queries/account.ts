import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'
import type { AdminUsersCursor } from '../../admin'
import { accountMethods, activeFriendInvite, adminUsers, friendInvite, me, signInOptions, userProfile } from '../../server/functions'
import { SSR_STALE_TIME } from './shared'

export const meQuery = () => queryOptions({ queryKey: ['me'], queryFn: () => me(), staleTime: SSR_STALE_TIME })
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
export const ADMIN_USERS_QUERY_KEY = ['admin-users'] as const
export const adminUsersQuery = (query: string) =>
  infiniteQueryOptions({
    queryKey: [...ADMIN_USERS_QUERY_KEY, query],
    queryFn: ({ pageParam }) => adminUsers({ data: { query, cursor: pageParam } }),
    initialPageParam: null as AdminUsersCursor | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: SSR_STALE_TIME,
  })

export const userProfileQuery = (userId: string) =>
  queryOptions({
    queryKey: ['user-profile', userId],
    queryFn: () => userProfile({ data: { userId } }),
    staleTime: SSR_STALE_TIME,
  })

export const signInOptionsQuery = () => queryOptions({ queryKey: ['sign-in-options'], queryFn: () => signInOptions(), staleTime: Infinity })

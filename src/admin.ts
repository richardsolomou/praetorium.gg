import type { BattleStatus } from './core/battle'

export type AdminUser = {
  id: string
  name: string
  email: string
  image: string | null
  role: 'admin' | 'user'
  emailVerified: boolean
  twoFactorEnabled: boolean
  createdAt: Date
  /** The latest sign-in or refresh of the player's own sessions, which refresh at most once a day. */
  lastSeenAt: Date | null
  rosterCount: number
  battleCount: number
  /** Leagues the player organizes, which deleting the account removes. */
  leagueCount: number
  friendCount: number
  signInMethods: { providerId: string; linkedAt: Date }[]
}

/** Orders that need counts from the product database rather than an account column. */
const ADMIN_USER_COUNT_SORTS = ['rosters', 'battles', 'friends', 'leagues'] as const
export type AdminUserCountSort = (typeof ADMIN_USER_COUNT_SORTS)[number]
export const ADMIN_USER_SORTS = ['name', 'email', 'joined', 'seen', ...ADMIN_USER_COUNT_SORTS] as const
export type AdminUserSort = (typeof ADMIN_USER_SORTS)[number]
export const isAdminUserCountSort = (sort: AdminUserSort): sort is AdminUserCountSort =>
  (ADMIN_USER_COUNT_SORTS as readonly string[]).includes(sort)
export const ADMIN_USER_ROLES = ['admin', 'user'] as const
export const ADMIN_USER_PAGE_SIZES = [10, 25, 50, 100] as const

export type AdminUsersRequest = {
  query: string
  /** Players holding any of these roles; empty keeps everyone. */
  role: AdminUser['role'][]
  sort: AdminUserSort
  descending: boolean
  page: number
  pageSize: number
}
export type AdminUserPage = { users: AdminUser[]; total: number }

/** What an administrator did, as counted in analytics. */
export type AdminAction =
  | 'role-changed'
  | 'user-deleted'
  | 'session-revoked'
  | 'sessions-revoked'
  | 'password-reset-sent'
  | 'profile-renamed'
  | 'profile-image-removed'
  | 'collection-photo-removed'
  | 'collection-photo-kept'
  | 'verification-sent'
  | 'email-verified'
  | 'sign-in-method-unlinked'
  | 'connection-revoked'
  | 'battle-deleted'

export type AdminSession = {
  id: string
  userAgent: string | null
  ipAddress: string | null
  createdAt: Date
  updatedAt: Date
  impersonatedBy: string | null
}

export type AdminConnection = { id: string; clientId: string; name: string; scopes: string[]; createdAt: Date }

export type AdminBattle = {
  token: string
  createdAt: number
  lastActivity: number
  status: BattleStatus
  round: number
  players: { id: string; name: string; side: number }[]
}

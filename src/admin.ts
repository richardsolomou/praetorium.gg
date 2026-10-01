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

export const ADMIN_USER_SORTS = ['joined', 'seen'] as const
export type AdminUserSort = (typeof ADMIN_USER_SORTS)[number]
export const ADMIN_USER_FILTERS = ['all', 'admins', 'no-two-factor', 'unverified'] as const
export type AdminUserFilter = (typeof ADMIN_USER_FILTERS)[number]

/** Where the next page starts in the chosen order: a join or last-seen time, null for players never seen. */
export type AdminUsersCursor = { at: Date | null; id: string }
export type AdminUserPage = { users: AdminUser[]; nextCursor: AdminUsersCursor | null }

/** What an administrator did, as counted in analytics. */
export type AdminAction =
  | 'role-changed'
  | 'user-deleted'
  | 'session-revoked'
  | 'sessions-revoked'
  | 'password-reset-sent'
  | 'profile-renamed'
  | 'profile-image-removed'
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
  status: 'setup' | 'playing' | 'finished'
  round: number
  players: { id: string; name: string; side: number }[]
}

import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

const date = (name: string) => integer(name, { mode: 'timestamp_ms' })
const flag = (name: string) => integer(name, { mode: 'boolean' })

export const user = sqliteTable(
  'user',
  {
    id: text('id').primaryKey().notNull(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    emailVerified: flag('emailVerified').notNull(),
    image: text('image'),
    createdAt: date('createdAt').notNull(),
    updatedAt: date('updatedAt').notNull(),
    role: text('role', { enum: ['admin', 'user'] })
      .notNull()
      .default('user'),
    banned: flag('banned').notNull().default(false),
    banReason: text('banReason'),
    banExpires: date('banExpires'),
    twoFactorEnabled: flag('twoFactorEnabled').notNull().default(false),
  },
  (table) => [index('user_role_idx').on(table.role), index('user_createdAt_id_idx').on(table.createdAt, table.id)],
)

export const session = sqliteTable(
  'session',
  {
    id: text('id').primaryKey().notNull(),
    expiresAt: date('expiresAt').notNull(),
    token: text('token').notNull().unique(),
    createdAt: date('createdAt').notNull(),
    updatedAt: date('updatedAt').notNull(),
    ipAddress: text('ipAddress'),
    userAgent: text('userAgent'),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    impersonatedBy: text('impersonatedBy'),
  },
  (table) => [index('session_userId_idx').on(table.userId)],
)

export const account = sqliteTable(
  'account',
  {
    id: text('id').primaryKey().notNull(),
    accountId: text('accountId').notNull(),
    issuer: text('issuer'),
    providerId: text('providerId').notNull(),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('accessToken'),
    refreshToken: text('refreshToken'),
    idToken: text('idToken'),
    accessTokenExpiresAt: date('accessTokenExpiresAt'),
    refreshTokenExpiresAt: date('refreshTokenExpiresAt'),
    scope: text('scope'),
    password: text('password'),
    createdAt: date('createdAt').notNull(),
    updatedAt: date('updatedAt').notNull(),
  },
  (table) => [index('account_userId_idx').on(table.userId), uniqueIndex('account_provider_account').on(table.providerId, table.accountId)],
)

export const verification = sqliteTable(
  'verification',
  {
    id: text('id').primaryKey().notNull(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: date('expiresAt').notNull(),
    createdAt: date('createdAt').notNull(),
    updatedAt: date('updatedAt').notNull(),
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
)

export const twoFactor = sqliteTable(
  'twoFactor',
  {
    id: text('id').primaryKey().notNull(),
    secret: text('secret').notNull(),
    backupCodes: text('backupCodes').notNull(),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    verified: flag('verified').notNull().default(true),
    failedVerificationCount: integer('failedVerificationCount').notNull().default(0),
    lockedUntil: date('lockedUntil'),
  },
  (table) => [index('twoFactor_secret_idx').on(table.secret), index('twoFactor_userId_idx').on(table.userId)],
)

export const rateLimit = sqliteTable('rateLimit', {
  id: text('id').primaryKey().notNull(),
  key: text('key').notNull().unique(),
  count: integer('count').notNull(),
  lastRequest: integer('lastRequest').notNull(),
})

export const jwks = sqliteTable('jwks', {
  id: text('id').primaryKey().notNull(),
  publicKey: text('publicKey').notNull(),
  privateKey: text('privateKey').notNull(),
  createdAt: date('createdAt').notNull(),
  expiresAt: date('expiresAt'),
  alg: text('alg'),
  crv: text('crv'),
})

export const schema = { user, session, account, verification, twoFactor, rateLimit, jwks }

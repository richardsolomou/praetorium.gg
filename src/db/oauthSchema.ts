import { index, sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { session, user } from './authSchema'

const date = (name: string) => integer(name, { mode: 'timestamp_ms' })
const flag = (name: string) => integer(name, { mode: 'boolean' })
const json = (name: string) => text(name)

export const oauthClient = sqliteTable(
  'oauthClient',
  {
    id: text('id').primaryKey(),
    clientId: text('clientId').notNull().unique(),
    clientSecret: text('clientSecret'),
    clientDiscoveryId: text('clientDiscoveryId'),
    disabled: flag('disabled'),
    skipConsent: flag('skipConsent'),
    enableEndSession: flag('enableEndSession'),
    subjectType: text('subjectType'),
    scopes: json('scopes'),
    clientCredentialsScopes: json('clientCredentialsScopes'),
    userId: text('userId').references(() => user.id, { onDelete: 'cascade' }),
    createdAt: date('createdAt'),
    updatedAt: date('updatedAt'),
    name: text('name'),
    uri: text('uri'),
    icon: text('icon'),
    contacts: json('contacts'),
    tos: text('tos'),
    policy: text('policy'),
    softwareId: text('softwareId'),
    softwareVersion: text('softwareVersion'),
    softwareStatement: text('softwareStatement'),
    redirectUris: json('redirectUris').notNull(),
    postLogoutRedirectUris: json('postLogoutRedirectUris'),
    backchannelLogoutUri: text('backchannelLogoutUri'),
    backchannelLogoutSessionRequired: flag('backchannelLogoutSessionRequired'),
    tokenEndpointAuthMethod: text('tokenEndpointAuthMethod'),
    applicationType: text('applicationType'),
    jwks: text('jwks'),
    jwksUri: text('jwksUri'),
    grantTypes: json('grantTypes'),
    responseTypes: json('responseTypes'),
    requirePKCE: flag('requirePKCE'),
    dpopBoundAccessTokens: flag('dpopBoundAccessTokens'),
    referenceId: text('referenceId'),
    metadata: json('metadata'),
  },
  (table) => [index('oauthClient_userId_idx').on(table.userId)],
)

export const oauthResource = sqliteTable('oauthResource', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull().unique(),
  name: text('name').notNull(),
  accessTokenTtl: integer('accessTokenTtl'),
  refreshTokenTtl: integer('refreshTokenTtl'),
  signingAlgorithm: text('signingAlgorithm'),
  signingKeyId: text('signingKeyId'),
  allowedScopes: json('allowedScopes'),
  customClaims: json('customClaims'),
  dpopBoundAccessTokensRequired: flag('dpopBoundAccessTokensRequired'),
  disabled: flag('disabled'),
  createdAt: date('createdAt'),
  updatedAt: date('updatedAt'),
  policyVersion: integer('policyVersion'),
  metadata: json('metadata'),
})

export const oauthClientResource = sqliteTable(
  'oauthClientResource',
  {
    id: text('id').primaryKey(),
    clientId: text('clientId')
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: 'cascade' }),
    resourceId: text('resourceId')
      .notNull()
      .references(() => oauthResource.identifier, { onDelete: 'cascade' }),
    metadata: json('metadata'),
    createdAt: date('createdAt'),
  },
  (table) => [
    index('oauthClientResource_clientId_idx').on(table.clientId),
    index('oauthClientResource_resourceId_idx').on(table.resourceId),
    uniqueIndex('oauthClientResource_clientId_resourceId_idx').on(table.clientId, table.resourceId),
  ],
)

export const oauthRefreshToken = sqliteTable(
  'oauthRefreshToken',
  {
    id: text('id').primaryKey(),
    token: text('token').notNull().unique(),
    clientId: text('clientId')
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: 'cascade' }),
    sessionId: text('sessionId').references(() => session.id, { onDelete: 'set null' }),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    referenceId: text('referenceId'),
    authorizationCodeId: text('authorizationCodeId'),
    resources: json('resources'),
    requestedUserInfoClaims: json('requestedUserInfoClaims'),
    expiresAt: date('expiresAt').notNull(),
    createdAt: date('createdAt').notNull(),
    revoked: date('revoked'),
    rotatedAt: date('rotatedAt'),
    rotationReplayResponse: text('rotationReplayResponse'),
    rotationReplayExpiresAt: date('rotationReplayExpiresAt'),
    authTime: date('authTime'),
    confirmation: json('confirmation'),
    scopes: json('scopes').notNull(),
  },
  (table) => [
    index('oauthRefreshToken_clientId_idx').on(table.clientId),
    index('oauthRefreshToken_sessionId_idx').on(table.sessionId),
    index('oauthRefreshToken_userId_idx').on(table.userId),
    index('oauthRefreshToken_authorizationCodeId_idx').on(table.authorizationCodeId),
  ],
)

export const oauthAccessToken = sqliteTable(
  'oauthAccessToken',
  {
    id: text('id').primaryKey(),
    token: text('token').notNull().unique(),
    clientId: text('clientId')
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: 'cascade' }),
    sessionId: text('sessionId').references(() => session.id, { onDelete: 'set null' }),
    userId: text('userId').references(() => user.id, { onDelete: 'cascade' }),
    referenceId: text('referenceId'),
    authorizationCodeId: text('authorizationCodeId'),
    resources: json('resources'),
    requestedUserInfoClaims: json('requestedUserInfoClaims'),
    refreshId: text('refreshId').references(() => oauthRefreshToken.id, { onDelete: 'cascade' }),
    expiresAt: date('expiresAt').notNull(),
    createdAt: date('createdAt').notNull(),
    revoked: date('revoked'),
    confirmation: json('confirmation'),
    scopes: json('scopes').notNull(),
  },
  (table) => [
    index('oauthAccessToken_clientId_idx').on(table.clientId),
    index('oauthAccessToken_sessionId_idx').on(table.sessionId),
    index('oauthAccessToken_userId_idx').on(table.userId),
    index('oauthAccessToken_authorizationCodeId_idx').on(table.authorizationCodeId),
    index('oauthAccessToken_refreshId_idx').on(table.refreshId),
  ],
)

export const oauthConsent = sqliteTable(
  'oauthConsent',
  {
    id: text('id').primaryKey(),
    clientId: text('clientId')
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: 'cascade' }),
    userId: text('userId').references(() => user.id, { onDelete: 'cascade' }),
    referenceId: text('referenceId'),
    resources: json('resources'),
    requestedUserInfoClaims: json('requestedUserInfoClaims'),
    scopes: json('scopes').notNull(),
    createdAt: date('createdAt').notNull(),
    updatedAt: date('updatedAt').notNull(),
  },
  (table) => [index('oauthConsent_clientId_idx').on(table.clientId), index('oauthConsent_userId_idx').on(table.userId)],
)

export const oauthClientAssertion = sqliteTable('oauthClientAssertion', {
  id: text('id').primaryKey(),
  expiresAt: date('expiresAt').notNull(),
})

export const oauthSchema = {
  oauthClient,
  oauthResource,
  oauthClientResource,
  oauthRefreshToken,
  oauthAccessToken,
  oauthConsent,
  oauthClientAssertion,
}

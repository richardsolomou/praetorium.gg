import { hash } from 'node:crypto'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import type { Command, Roster } from '../src/core/battle'
import type { LeagueSide } from '../src/contracts/schemas'
import type { RosterPick } from '../src/core/roster'
import { rosterSnapshot } from '../src/core/rosterSnapshot'
import { clubGameOpen } from '../src/core/club'
import { rosterDiscoveryQuerySchema } from '../src/core/rosterDiscovery'
import { routeSlug } from '../src/core/slug'
import { account as authAccount, user } from '../src/db/authSchema'
import { createSqliteAuth } from '../src/server/sqliteAuth'
import { SqliteAccountRepository } from '../src/server/accountRepository'
import { localAuthDatabase } from '../src/server/localAuthDatabase'
import { rosterRow } from '../src/server/rosterPersistence'
import { SpacetimeOperator } from '../src/server/spacetimeOperator'
import { SpacetimeRepository } from '../src/server/spacetimeRepository'
import { unitBattleDetailsIn } from '../src/shared/catalogue'
import { buildLeagueBattle } from '../src/shared/leagueBattle'
import { catalogueBaseUrl, fetchCurrentSnapshot, installedSnapshot } from '../src/server/catalogueSnapshot'
import { catalogueDirectory } from '../src/server/catalogueIndex'
import { calculateRosterPrice } from '../src/shared/pricing'
import { isEntryPoint } from './lib/entryPoint.ts'
import { loadSnapshotWithRules } from './lib/catalogueSnapshotLoad'

export const PREVIEW_EMAIL = 'preview@praetorium.gg'
export const PREVIEW_PASSWORD = 'preview-preview-preview'
export const PREVIEW_OPPONENT_EMAIL = 'opponent@praetorium.gg'
const PREVIEW_OPPONENT_PASSWORD = 'opponent-opponent-opponent'
export const PREVIEW_ALLY_EMAIL = 'ally@praetorium.gg'
const PREVIEW_ALLY_PASSWORD = 'ally-ally-ally-ally'
export const PREVIEW_RIVAL_EMAIL = 'rival@praetorium.gg'
const PREVIEW_RIVAL_PASSWORD = 'rival-rival-rival-rival'
const PREVIEW_STRANGER_EMAIL = 'stranger@praetorium.gg'
const PREVIEW_STRANGER_PASSWORD = 'stranger-stranger-stranger'
const PREVIEW_WANDERER_EMAIL = 'wanderer@praetorium.gg'
const PREVIEW_WANDERER_PASSWORD = 'wanderer-wanderer-wanderer'

const PRACTICE_OPPONENTS = [
  { id: 'practice-opponent-1', name: 'Practice Opponent' },
  { id: 'practice-opponent-2', name: 'Practice Opponent II' },
] as const

export type PreviewRoster = {
  id: string
  name: string
  catalogueId: string
  detachmentIds: readonly string[]
  disposition: string
  limit: number
  picks: readonly RosterPick[]
}

/** Four distinct factions split between Strike Force and Incursion rosters. */
const PREVIEW_PLAYER_ROSTERS: readonly PreviewRoster[] = [
  {
    id: 'preview-necrons-cursed-skyshroud',
    name: 'Cursed Skyshroud 2K',
    catalogueId: 'b654-a18a-ea1-3bf2',
    detachmentIds: ['c4ee-83c7-812c-5ff0', '51c2-e233-ea51-14df'],
    disposition: 'purge-the-foe',
    limit: 2000,
    picks: [
      { entryId: '166f-78e9-3ef-63a0' },
      { entryId: '166f-78e9-3ef-63a0' },
      { entryId: '8948-9f32-ab71-f41e' },
      { entryId: '8948-9f32-ab71-f41e' },
      { entryId: '2b97-4d0b-44dd-ad6b' },
      { entryId: '2b97-4d0b-44dd-ad6b' },
      { entryId: '77cf-f4ac-7e36-6464', models: 3 },
      { entryId: '77cf-f4ac-7e36-6464', models: 6 },
      { entryId: 'd8f0-1727-fcdd-7ee9', models: 6 },
      { entryId: 'd8f0-1727-fcdd-7ee9', models: 6 },
      { entryId: '821d-665-499f-e895', models: 10 },
      { entryId: '6733-60f-2fbe-e3bd', toggles: { '6f49-3919-b28c-3c0d': 1 } },
      { entryId: '5c25-2188-d5fe-ef0d', models: 10 },
    ],
  },
  {
    id: 'preview-space-marines-gladius',
    name: 'Gladius Spearhead 1K',
    catalogueId: 'e0af-67df-9d63-8fb7',
    detachmentIds: ['d2dc-693e-b491-b16d'],
    disposition: 'priority-assets',
    limit: 1000,
    picks: [
      { entryId: '91e3-a419-8c58-98f5', toggles: { 'a89c-b01e-ffab-8ebb': 1 } },
      { entryId: '9770-3a56-619e-f390', attachedTo: 3 },
      { entryId: 'cd69-af58-774-d387', attachedTo: 4 },
      { entryId: '85b1-eb9a-17a6-e5be' },
      { entryId: 'c432-5254-8a25-6c8a' },
      { entryId: '4c8-e877-566b-a1ee' },
      { entryId: 'fcb6-80ca-22a-4771' },
      { entryId: 'efc9-2aff-c5b-6790' },
      { entryId: '13d8-1933-472c-80ed' },
    ],
  },
  {
    id: 'preview-astra-militarum-combined-arms',
    name: 'Combined Arms 2K',
    catalogueId: 'b0ae-12a5-c84-ea45',
    detachmentIds: ['67ce-ebd5-b428-e4f7'],
    disposition: 'take-and-hold',
    limit: 2000,
    picks: [
      { entryId: 'd2de-6903-46a-f02c' },
      { entryId: 'c43b-26b5-4c4-521c' },
      { entryId: '1a39-2529-3722-60d3' },
      { entryId: '7b5-9080-f871-aff9' },
      { entryId: '7b5-9080-f871-aff9' },
      { entryId: '7b5-9080-f871-aff9' },
      { entryId: '4fb3-5033-9135-e605' },
      { entryId: '3628-3edf-659e-6405' },
      { entryId: '39a7-1ea5-9552-d4ba' },
      { entryId: '9357-7f3f-56be-3129' },
      { entryId: '9357-7f3f-56be-3129' },
      { entryId: '4071-d276-4b66-b186' },
      { entryId: '805a-7234-cf45-24fb' },
      { entryId: 'aa89-8d18-ab88-85ef' },
      { entryId: '287e-ac22-3dc3-fac0' },
      { entryId: 'c7e0-68a4-64af-88e4' },
      { entryId: '77a1-a36b-5192-b450' },
      { entryId: 'f790-9b08-1134-58b3' },
      { entryId: 'df92-e0be-df8f-73fc' },
      { entryId: 'f86e-edef-7ce6-6ded' },
    ],
  },
  {
    id: 'preview-death-guard-virulent-vectorium',
    name: 'Virulent Vectorium 1K',
    catalogueId: '5108-f98-63c2-53cb',
    detachmentIds: ['e2ff-ece0-6cbb-be05'],
    disposition: 'take-and-hold',
    limit: 1000,
    picks: [
      { entryId: '10a1-5896-98da-8c7c', toggles: { '222-fc2-845f-6aa2': 1 } },
      { entryId: '7ff5-9b50-8c58-b32e' },
      { entryId: '7ff5-9b50-8c58-b32e' },
      { entryId: '87a0-216e-215b-d3c8' },
      { entryId: 'c5ce-7c31-b5a6-1bd' },
      { entryId: '76ab-697e-17ea-5edf' },
      { entryId: 'c935-4db0-a2f-1bd8' },
      { entryId: '6ccf-b8b-fa83-8476' },
      { entryId: 'a0fc-8a48-f51e-f81b' },
    ],
  },
]

/** Four more factions for the second interactive login. */
export const PREVIEW_OPPONENT_ROSTERS: readonly PreviewRoster[] = [
  {
    id: 'preview-opponent-orks',
    name: 'Taktikal Stompa 2K',
    catalogueId: 'a55f-b7b3-6c65-a05f',
    detachmentIds: ['fdd5-9868-a9ee-e9f1'],
    disposition: 'reconnaissance',
    limit: 2000,
    picks: [
      { entryId: '4dc0-5822-5cfb-6a02' },
      { entryId: '473e-73f9-493d-6a0a', toggles: { 'b963-64cd-ff80-9cb5': 1 } },
      { entryId: 'c5a3-4245-9b6a-fb8' },
      { entryId: '9af5-6820-1ff2-6c01' },
      { entryId: '6c12-6df4-9d3a-2cc' },
      { entryId: '6c12-6df4-9d3a-2cc' },
      { entryId: 'bd8-4180-6880-1f45' },
    ],
  },
  {
    id: 'preview-opponent-tyranids',
    name: 'Devouring Swarm 1K',
    catalogueId: 'b984-7317-81cc-20f',
    detachmentIds: ['c2fe-bf23-bf24-aa43'],
    disposition: 'take-and-hold',
    limit: 1000,
    picks: [
      { entryId: 'd160-2a74-7d96-5e9f', toggles: { 'a2d3-5a18-5a14-26ac': 1 } },
      { entryId: '16f9-9c76-2e0e-dc49' },
      { entryId: '16f9-9c76-2e0e-dc49' },
      { entryId: '210a-cb5f-b323-6cbb' },
      { entryId: 'b2fd-5fa7-ea48-c851' },
      { entryId: '53a9-7a08-b3dd-1547' },
      { entryId: 'fe7f-7bff-cc64-ef7' },
      { entryId: 'b25f-20ce-a25a-1642' },
      { entryId: 'bb17-5e67-f80d-1479' },
      { entryId: 'b6ef-5582-5c2c-c917' },
      { entryId: '2022-800a-5f81-59c3' },
      { entryId: 'cbe1-73ce-de38-219e' },
    ],
  },
  {
    id: 'preview-opponent-aeldari',
    name: 'Warhost 2K',
    catalogueId: '34a5-8c7e-f468-82d1',
    detachmentIds: ['3c31-6fac-9914-827a'],
    disposition: 'reconnaissance',
    limit: 2000,
    picks: [
      { entryId: '115d-8239-dc6c-9e5d' },
      { entryId: 'bc16-e600-5fe4-92e8', toggles: { '1f60-2b04-63dc-bf59': 1 } },
      { entryId: 'acc4-30c4-39c0-71e' },
      { entryId: 'db9e-df49-2d53-3dca' },
      { entryId: 'db9e-df49-2d53-3dca' },
      { entryId: 'a203-f251-2149-a253' },
      { entryId: '860c-99de-5711-8c0' },
      { entryId: '6080-9e99-1811-9186' },
      { entryId: '6080-9e99-1811-9186' },
      { entryId: '9392-ba80-6ec0-fba0' },
      { entryId: '5e87-dba1-7036-de2a' },
      { entryId: '95d-ae5a-5668-b5b' },
      { entryId: 'd4d2-fedf-140e-3f76' },
      { entryId: 'c302-5769-871e-853b' },
      { entryId: '883a-c454-765-a743' },
      { entryId: '90de-b0ab-de85-e40b' },
      { entryId: 'e98c-b305-1b4b-f54' },
      { entryId: '6e10-c7d2-905f-1f99' },
      { entryId: '2a7d-902-33d3-f639' },
    ],
  },
  {
    id: 'preview-opponent-world-eaters',
    name: 'Berzerker Warband 1K',
    catalogueId: 'df9a-59b2-f464-59ad',
    detachmentIds: ['3490-ec82-70b3-c5cf'],
    disposition: 'purge-the-foe',
    limit: 1000,
    picks: [
      { entryId: '1cfc-2dc0-2a7a-28fe', toggles: { '3578-501d-c196-f54d': 1 } },
      { entryId: 'b250-a2f9-7098-353d' },
      { entryId: '8568-71db-b833-93d5' },
      { entryId: '96aa-4baa-2cb2-da3d' },
      { entryId: 'e213-0676-347e-9292' },
      { entryId: '891d-f175-70de-994e' },
      { entryId: 'f867-cbc9-d166-18eb' },
      { entryId: 'ca7d-c77a-28e2-7b6b' },
      { entryId: '6afa-65ac-21df-090d' },
    ],
  },
]

function rosterCopy(source: PreviewRoster, id: string): PreviewRoster {
  return { ...source, id, picks: source.picks.map((pick) => ({ ...pick })) }
}

export const PREVIEW_ROSTERS: readonly PreviewRoster[] = [
  ...PREVIEW_PLAYER_ROSTERS,
  ...PREVIEW_OPPONENT_ROSTERS.map((roster) => rosterCopy(roster, roster.id.replace('preview-opponent-', 'preview-'))),
]

export const PREVIEW_ALLY_ROSTERS: readonly PreviewRoster[] = [
  rosterCopy(PREVIEW_PLAYER_ROSTERS[3]!, 'preview-ally-death-guard'),
  rosterCopy(PREVIEW_PLAYER_ROSTERS[1]!, 'preview-ally-space-marines'),
  rosterCopy(PREVIEW_PLAYER_ROSTERS[2]!, 'preview-ally-astra-militarum'),
]

export const PREVIEW_RIVAL_ROSTERS: readonly PreviewRoster[] = [
  rosterCopy(PREVIEW_OPPONENT_ROSTERS[3]!, 'preview-rival-world-eaters'),
  rosterCopy(PREVIEW_OPPONENT_ROSTERS[1]!, 'preview-rival-tyranids'),
  rosterCopy(PREVIEW_OPPONENT_ROSTERS[0]!, 'preview-rival-orks'),
]

/** Two players who know each other but not the preview login, so its public feed has strangers in it. */
const PREVIEW_STRANGER_ROSTERS: readonly PreviewRoster[] = [
  rosterCopy(PREVIEW_OPPONENT_ROSTERS[2]!, 'preview-stranger-aeldari'),
  rosterCopy(PREVIEW_PLAYER_ROSTERS[0]!, 'preview-stranger-necrons'),
]

const PREVIEW_WANDERER_ROSTERS: readonly PreviewRoster[] = [
  rosterCopy(PREVIEW_OPPONENT_ROSTERS[0]!, 'preview-wanderer-orks'),
  rosterCopy(PREVIEW_PLAYER_ROSTERS[2]!, 'preview-wanderer-astra-militarum'),
]

export const PREVIEW_ACCOUNTS = [
  { email: PREVIEW_EMAIL, password: PREVIEW_PASSWORD, name: 'Preview Player', rosters: PREVIEW_ROSTERS },
  { email: PREVIEW_OPPONENT_EMAIL, password: PREVIEW_OPPONENT_PASSWORD, name: 'Preview Opponent', rosters: PREVIEW_OPPONENT_ROSTERS },
  { email: PREVIEW_ALLY_EMAIL, password: PREVIEW_ALLY_PASSWORD, name: 'Preview Ally', rosters: PREVIEW_ALLY_ROSTERS },
  { email: PREVIEW_RIVAL_EMAIL, password: PREVIEW_RIVAL_PASSWORD, name: 'Preview Rival', rosters: PREVIEW_RIVAL_ROSTERS },
  { email: PREVIEW_STRANGER_EMAIL, password: PREVIEW_STRANGER_PASSWORD, name: 'Kieran Vale', rosters: PREVIEW_STRANGER_ROSTERS },
  { email: PREVIEW_WANDERER_EMAIL, password: PREVIEW_WANDERER_PASSWORD, name: 'Sam Okafor', rosters: PREVIEW_WANDERER_ROSTERS },
] as const

const PREVIEW_ALL_ROSTERS = PREVIEW_ACCOUNTS.flatMap((account) => account.rosters)

export type PreviewSnapshots = ReadonlyMap<string, Roster>

export function previewAccountId(database: string, email: string) {
  return hash('sha256', `${database}\0${email}`).slice(0, 32)
}

export async function seedPreview(providedSnapshots?: PreviewSnapshots) {
  if (process.env.PRAETORIUM_SEED_PREVIEW !== 'true') throw new Error('Refusing to seed a database without the preview flag')
  if (
    !process.env.SPACETIME_URL ||
    !process.env.SPACETIME_DATABASE ||
    !process.env.SPACETIME_OPERATOR_TOKEN ||
    !process.env.AUTH_SECRET ||
    !process.env.AUTH_SQLITE_PATH
  ) {
    throw new Error('Preview seed requires SpacetimeDB and auth configuration')
  }
  const snapshots = providedSnapshots ?? (await verifiedSnapshots())
  const local = localAuthDatabase(process.env.AUTH_SQLITE_PATH)
  const database = local.database
  const product = new SpacetimeOperator(
    process.env.SPACETIME_URL,
    process.env.SPACETIME_DATABASE,
    process.env.SPACETIME_OPERATOR_TOKEN,
    fetch,
    process.env.SPACETIME_ACCESS_CLIENT_ID && process.env.SPACETIME_ACCESS_CLIENT_SECRET
      ? { clientId: process.env.SPACETIME_ACCESS_CLIENT_ID, clientSecret: process.env.SPACETIME_ACCESS_CLIENT_SECRET }
      : undefined,
    process.env.SPACETIME_INTERNAL_HOST,
  )
  const authOptions: Parameters<typeof createSqliteAuth>[2] = {
    environment: process.env,
    userIdForNewAccount: (email) => previewAccountId(process.env.SPACETIME_DATABASE!, email),
    deleteUserData: (userId) => product.deleteUserData(userId),
    revokeSessionAccess: (sessionId) => product.revokeSession(sessionId),
    storeSocialAvatar: async () => null,
    updateProfile: async (data) => ({ ok: true, data }),
  }
  const auth = createSqliteAuth(database, process.env.AUTH_SECRET, authOptions)
  const repository = new SpacetimeRepository(new SqliteAccountRepository(database), product)
  try {
    const userIds = await seedInto(
      repository,
      auth,
      async (email) => {
        const [row] = await database.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1)
        return row?.id ?? null
      },
      snapshots,
    )
    for (const opponent of PRACTICE_OPPONENTS) {
      const email = `${opponent.id}@praetorium.invalid`
      const [existing] = await database.select({ email: user.email }).from(user).where(eq(user.id, opponent.id)).limit(1)
      if (existing && existing.email !== email) throw new Error(`Practice opponent ${opponent.id} is an existing account`)
      const [credential] = await database
        .select({ id: authAccount.id })
        .from(authAccount)
        .where(eq(authAccount.userId, opponent.id))
        .limit(1)
      if (credential) throw new Error(`Practice opponent ${opponent.id} has sign-in credentials`)
      if (!existing) {
        const now = new Date()
        await database.insert(user).values({
          id: opponent.id,
          name: opponent.name,
          email,
          emailVerified: false,
          createdAt: now,
          updatedAt: now,
        })
      }
      await product.registerPracticeOpponent(opponent.id)
    }
    await readBack(repository, product, userIds)
  } finally {
    local.client.close()
  }
}

/**
 * Reads everything the seeded data feeds, as each account. `scripts/releasedServer.test.ts` runs a released seed
 * against a newer module, so this is where the released server's parsers meet what that module returns; it also fails
 * when a module procedure is neither called by the seed nor listed there as one it cannot reach.
 */
async function readBack(repository: SpacetimeRepository, product: SpacetimeOperator, userIds: readonly string[]) {
  const page = { limit: 100 }
  await product.health()
  await product.publicStandingsRevision()
  await product.productStats(userIds)
  await product.pushTargets(userIds)
  await repository.practiceOpponents()
  await repository.publicBattles(page)
  await repository.discoverRosters(rosterDiscoveryQuerySchema.parse({ catalogueIds: null, detachmentIds: null, before: null, limit: 24 }))
  await repository.heldCollectionPhotos(100)
  await repository.adminCollectionPhotos({ before: null, limit: 100 })
  await repository.collectionPhotoDeletions(100)
  for (const photoId of await repository.collectionPhotoIds(null, 100)) await repository.collectionPhotoForAdmin(photoId)
  const leagueTokens = new Set<string>()
  const clubTokens = new Set<string>()
  for (const userId of userIds) {
    await repository.relationships(userId)
    await repository.friendInviteByInviter(userId)
    await repository.onboardingProgress(userId)
    await repository.playerDefaults(userId)
    await repository.pushEnabled(userId)
    await repository.recentMatchupsByUser(userId)
    await repository.abilityRemindersByUser(userId)
    await repository.unitLoadoutsByUser(userId)
    await repository.favouriteFactionsByUser(userId)
    await repository.favouriteDetachmentsByUser(userId)
    await repository.favouriteDatasheetsByUser(userId)
    await repository.collectionProfile(userId, userId)
    await repository.collectionWishesByUser(userId)
    for (const entry of await repository.collectionByUser(userId)) await repository.datasheetPhotos(entry.entryId, userId, 100)
    await repository.homeRostersByUser(userId)
    await repository.rostersLentTo(userId)
    await repository.friendLeagueRosters(userId)
    const rosters = await repository.rosterSummariesByUser(userId)
    await repository.rostersByUser(userId)
    await repository.rostersByIds(
      userId,
      rosters.map((roster) => roster.id),
    )
    for (const roster of rosters) {
      await repository.rosterGroupByUser(userId, roster.baseRosterId ?? roster.id)
      await repository.rosterLoansByRoster(roster.id, userId)
      await repository.usableRoster(roster.id, userId)
      await repository.outdatedLeagueEntriesForRoster(userId, roster.id)
    }
    const { battles } = await repository.battlesByUser(userId, page)
    await repository.battlesByFriends(userId, page)
    for (const { battle, players } of battles) {
      await repository.battleClubs(battle.id)
      await product.battleForOperator(battle.id)
      await repository.leagueBattleCandidates(
        userId,
        players.map((player) => player.id),
      )
    }
    for (const league of await repository.leaguesVisibleTo(userId)) {
      leagueTokens.add(league.token)
      await repository.leagueByToken(league.token, userId)
      await repository.eventAddress(league.token, league.eventToken)
      await repository.leagueRoster(league.token, userId, league.eventToken, userId)
      await repository.leagueRosterSharing(league.token, league.eventToken, userId)
    }
    for (const club of await repository.clubsVisibleTo(userId)) {
      clubTokens.add(club.token)
      await repository.clubByToken(club.token)
      await repository.battlesByClub(club.token, page)
    }
  }
  await repository.leagueNames([...leagueTokens])
  await repository.clubNames([...clubTokens])
}

async function verifiedSnapshots(): Promise<PreviewSnapshots> {
  const directory = process.env.CATALOGUE_DIR ? path.resolve(process.env.CATALOGUE_DIR) : catalogueDirectory()
  if (process.env.PRAETORIUM_LOCAL_DEV !== 'true' && !process.env.CATALOGUE_LIVE_DIR && !installedSnapshot(directory))
    await fetchCurrentSnapshot(directory, catalogueBaseUrl(), (message) => console.log(message))
  const { catalogue, rules } = loadSnapshotWithRules(directory)

  return new Map(
    PREVIEW_ALL_ROSTERS.map((saved) => {
      const priced = calculateRosterPrice(
        {
          catalogueId: saved.catalogueId,
          detachmentIds: [...saved.detachmentIds],
          disposition: saved.disposition,
          limit: saved.limit,
          units: saved.picks.map((pick) => ({ ...pick })),
        },
        catalogue,
        rules,
      )
      const error = !priced
        ? 'could not be priced'
        : priced.points > saved.limit
          ? `${priced.points} points exceed its ${saved.limit}-point limit`
          : (priced.detachmentError ?? priced.dispositionError ?? priced.errors[0]?.message)
      if (!priced || error) throw new Error(`${saved.name} ${error}`)
      const snapshot = rosterSnapshot(
        { ...saved, detachmentIds: [...saved.detachmentIds], waivedRules: [], picks: saved.picks.map((pick) => ({ ...pick })) },
        priced,
        unitBattleDetailsIn(
          catalogue,
          saved.catalogueId,
          saved.picks.map((pick) => pick.entryId),
        ),
      )
      return [saved.id, snapshot] as const
    }),
  )
}

async function seedInto(
  repository: SpacetimeRepository,
  auth: ReturnType<typeof createSqliteAuth>,
  userIdByEmail: (email: string) => Promise<string | null>,
  snapshots: PreviewSnapshots,
) {
  let clock = Date.now() - 1_000
  const now = () => ++clock
  const ids = new Map<string, string>()

  for (const account of PREVIEW_ACCOUNTS) {
    const id = await ensurePreviewUser(account.email, account.password, account.name)
    ids.set(account.email, id)
    for (const roster of account.rosters) await saveRoster(roster, id)
  }

  const previewUserId = accountId(PREVIEW_EMAIL)
  const opponentUserId = accountId(PREVIEW_OPPONENT_EMAIL)
  const allyUserId = accountId(PREVIEW_ALLY_EMAIL)
  const rivalUserId = accountId(PREVIEW_RIVAL_EMAIL)
  const players = [previewUserId, opponentUserId, allyUserId, rivalUserId]
  for (const [index, left] of players.entries()) {
    for (const right of players.slice(index + 1)) await befriend(left, right)
  }
  const strangerUserId = accountId(PREVIEW_STRANGER_EMAIL)
  const wandererUserId = accountId(PREVIEW_WANDERER_EMAIL)
  await befriend(strangerUserId, wandererUserId)

  for (const catalogueId of [PREVIEW_ROSTERS[0]!.catalogueId, PREVIEW_ROSTERS[4]!.catalogueId, PREVIEW_ROSTERS[6]!.catalogueId]) {
    await repository.addFavouriteFaction({ userId: previewUserId, catalogueId, now: now() })
  }
  for (const roster of [PREVIEW_ROSTERS[0]!, PREVIEW_ROSTERS[1]!, PREVIEW_ROSTERS[6]!]) {
    for (const detachmentId of roster.detachmentIds) {
      await repository.addFavouriteDetachment({ userId: previewUserId, catalogueId: roster.catalogueId, detachmentId, now: now() })
    }
  }
  for (const entryId of PREVIEW_ROSTERS.slice(0, 4).flatMap((roster) => roster.picks.slice(0, 2).map((pick) => pick.entryId))) {
    await repository.addToCollection({ userId: previewUserId, entryId, now: now() })
  }

  // Created first, so they are the oldest public games and leave the newest to the preview login's own.
  // A run of finished games so the strangers' profiles and records have a history to read.
  const history: [number, number, number, number][] = [
    [62, 48, 41, 55],
    [70, 66, 38, 30],
    [55, 71, 60, 64],
    [80, 45, 52, 58],
    [66, 60, 49, 61],
    [74, 59, 35, 42],
  ]
  for (const [index, [kieranScore, samScore, kieranCp, samCp]] of history.entries()) {
    const kieranFirst = index % 2 === 0
    await createCasualBattle({
      id: `preview-public-history-${index + 1}`,
      token: `preview-public-history-${index + 1}`,
      creatorId: kieranFirst ? strangerUserId : wandererUserId,
      opponentIds: [kieranFirst ? wandererUserId : strangerUserId],
      limit: 2_000,
      rosters: kieranFirst
        ? [
            [strangerUserId, index % 3 ? 'preview-stranger-necrons' : 'preview-stranger-aeldari'],
            [wandererUserId, index % 2 ? 'preview-wanderer-astra-militarum' : 'preview-wanderer-orks'],
          ]
        : [
            [wandererUserId, index % 3 ? 'preview-wanderer-orks' : 'preview-wanderer-astra-militarum'],
            [strangerUserId, index % 2 ? 'preview-stranger-aeldari' : 'preview-stranger-necrons'],
          ],
      tail: [
        { kind: 'begin-battle', firstPlayerId: kieranFirst ? strangerUserId : wandererUserId },
        { kind: 'score', category: 'primary', delta: kieranScore - Math.round(kieranCp / 2), playerId: strangerUserId },
        { kind: 'score', category: 'secondary', delta: Math.round(kieranCp / 2), playerId: strangerUserId },
        { kind: 'score', category: 'primary', delta: samScore - Math.round(samCp / 2), playerId: wandererUserId },
        { kind: 'score', category: 'secondary', delta: Math.round(samCp / 2), playerId: wandererUserId },
        { kind: 'end-battle', reason: 'conceded', concededBy: kieranScore > samScore ? wandererUserId : strangerUserId },
      ],
    })
  }
  // Kieran's service record: secondaries past the table's ten rows, cards and stratagems
  // seen often enough to rank, and core stratagems under both the slug keys older
  // catalogues used and the source ids newer ones use.
  const card = (name: string) => ({ key: routeSlug(name), name })
  const core = (name: string, renamed: boolean) => ({
    key: renamed ? `core-${routeSlug(name)}` : routeSlug(name),
    name,
    cp: 1,
    limit: 'phase' as const,
  })
  const record = [
    {
      cards: ['Assassination', 'Behind Enemy Lines'],
      won: true,
      points: [6, 4],
      used: ['Command Re-roll', 'Fire Overwatch', 'Insane Bravery'],
    },
    { cards: ['Assassination', 'Cleanse'], won: true, points: [8, 5], used: ['Command Re-roll', 'Smokescreen', 'Counter-Offensive'] },
    { cards: ['Assassination', 'Bring It Down'], won: false, points: [5, 2], used: ['Smokescreen', 'Explosives', 'Crushing Impact'] },
    {
      cards: ['Behind Enemy Lines', 'Engage on All Fronts'],
      won: true,
      points: [3, 6],
      used: ['Command Re-roll', 'Fire Overwatch', 'Grenade'],
    },
    { cards: ['Behind Enemy Lines', 'Centre Ground'], won: false, points: [2, 4], used: ['Smokescreen', 'Rapid Ingress', 'Tank Shock'] },
    { cards: ['Cleanse', 'Display of Might'], won: true, points: [4, 3], used: ['Command Re-roll', 'Fire Overwatch', 'Grenade'] },
    { cards: ['Cleanse', 'Forward Position'], won: false, points: [1, 5], used: ['Smokescreen', 'Explosives', 'Counter-Offensive'] },
    {
      cards: ['No Prisoners', 'Overwhelming Force'],
      won: true,
      points: [5, 7],
      used: ['Command Re-roll', 'Heroic Intervention', 'Tank Shock'],
    },
    { cards: ['Plunder', 'A Tempting Target'], won: false, points: [3, 0], used: ['Epic Challenge', 'Smokescreen', 'Insane Bravery'] },
  ]
  for (const [index, battle] of record.entries()) {
    const opponentId = index % 3 ? wandererUserId : rivalUserId
    const renamed = index >= 4
    await createCasualBattle({
      id: `preview-kieran-record-${index}`,
      token: `preview-kieran-record-${index}`,
      creatorId: strangerUserId,
      opponentIds: [opponentId],
      limit: 2_000,
      rosters: [
        [strangerUserId, index % 2 ? 'preview-stranger-necrons' : 'preview-stranger-aeldari'],
        [opponentId, index % 3 ? 'preview-wanderer-orks' : 'preview-rival-orks'],
      ],
      tail: [
        {
          kind: 'set-prep',
          playerId: strangerUserId,
          stratagems: battle.used.map((name) => core(name, renamed)),
          secondaries: battle.cards.map(card),
          primary: null,
          secondaryMode: 'fixed',
        },
        { kind: 'begin-battle', firstPlayerId: index % 2 ? opponentId : strangerUserId },
        { kind: 'correct-player', playerId: strangerUserId, resource: 'cp', delta: battle.used.length },
        ...battle.used.map((name) => ({ kind: 'use-stratagem' as const, key: core(name, renamed).key, playerId: strangerUserId })),
        { kind: 'score', category: 'primary', delta: battle.won ? 40 : 25, playerId: strangerUserId },
        ...battle.cards.flatMap((name, at) =>
          battle.points[at]
            ? [{ kind: 'score-secondary' as const, key: card(name).key, delta: battle.points[at], playerId: strangerUserId }]
            : [],
        ),
        { kind: 'score', category: 'primary', delta: battle.won ? 30 : 45, playerId: opponentId },
        { kind: 'end-battle', reason: 'conceded', concededBy: battle.won ? opponentId : strangerUserId },
      ],
    })
  }
  await createCasualBattle({
    id: 'preview-public-finished',
    token: 'preview-public-finished',
    creatorId: strangerUserId,
    opponentIds: [wandererUserId],
    limit: 2_000,
    rosters: [
      [strangerUserId, 'preview-stranger-aeldari'],
      [wandererUserId, 'preview-wanderer-orks'],
    ],
    tail: [
      { kind: 'begin-battle', firstPlayerId: strangerUserId },
      { kind: 'score', category: 'primary', delta: 45, playerId: strangerUserId },
      { kind: 'score', category: 'secondary', delta: 27, playerId: strangerUserId },
      { kind: 'score', category: 'primary', delta: 40, playerId: wandererUserId },
      { kind: 'score', category: 'secondary', delta: 21, playerId: wandererUserId },
      { kind: 'end-battle', reason: 'conceded', concededBy: wandererUserId },
    ],
  })
  await createCasualBattle({
    id: 'preview-public-live',
    token: 'preview-public-live',
    creatorId: wandererUserId,
    opponentIds: [strangerUserId],
    limit: 2_000,
    rosters: [
      [wandererUserId, 'preview-wanderer-astra-militarum'],
      [strangerUserId, 'preview-stranger-necrons'],
    ],
    tail: [
      { kind: 'begin-battle', firstPlayerId: wandererUserId },
      { kind: 'score', category: 'primary', delta: 15, playerId: wandererUserId },
      { kind: 'score', category: 'primary', delta: 10, playerId: strangerUserId },
      { kind: 'score', category: 'secondary', delta: 8, playerId: strangerUserId },
    ],
  })
  await createCasualBattle({
    id: 'preview-public-setup',
    token: 'preview-public-setup',
    creatorId: strangerUserId,
    opponentIds: [wandererUserId],
    limit: 2_000,
    rosters: [
      [strangerUserId, 'preview-stranger-necrons'],
      [wandererUserId, 'preview-wanderer-orks'],
    ],
    tail: [{ kind: 'set-setup-step', step: 2 }],
  })
  await createCasualBattle({
    id: 'preview-casual-incursion',
    token: 'preview-casual-incursion',
    creatorId: previewUserId,
    opponentIds: [opponentUserId],
    limit: 1_000,
    rosters: [
      [previewUserId, 'preview-space-marines-gladius'],
      [opponentUserId, 'preview-opponent-tyranids'],
    ],
    tail: [{ kind: 'set-setup-step', step: 3 }],
  })
  await createCasualBattle({
    id: 'preview-casual-strike-force',
    token: 'preview-casual-strike-force',
    creatorId: previewUserId,
    opponentIds: [opponentUserId],
    limit: 2_000,
    rosters: [
      [previewUserId, 'preview-necrons-cursed-skyshroud'],
      [opponentUserId, 'preview-opponent-orks'],
    ],
    tail: [{ kind: 'begin-battle', firstPlayerId: previewUserId }],
  })
  await createCasualBattle({
    id: 'preview-casual-solo-pair',
    token: 'preview-casual-solo-pair',
    creatorId: previewUserId,
    opponentIds: [opponentUserId, allyUserId],
    limit: 2_000,
    rosters: [
      [previewUserId, 'preview-astra-militarum-combined-arms'],
      [opponentUserId, 'preview-opponent-tyranids'],
      [allyUserId, 'preview-ally-death-guard'],
    ],
    tail: [{ kind: 'begin-battle', firstPlayerId: opponentUserId }],
  })
  await createCasualBattle({
    id: 'preview-casual-doubles',
    token: 'preview-casual-doubles',
    creatorId: previewUserId,
    allyIds: [allyUserId],
    opponentIds: [opponentUserId, rivalUserId],
    limit: 2_000,
    rosters: [
      [previewUserId, 'preview-space-marines-gladius'],
      [allyUserId, 'preview-ally-space-marines'],
      [opponentUserId, 'preview-opponent-tyranids'],
      [rivalUserId, 'preview-rival-tyranids'],
    ],
    tail: [{ kind: 'set-setup-step', step: 2 }],
  })

  if (process.env.PRAETORIUM_SEED_STRESS_REPLAY === 'true') {
    const tail: Command[] = [{ kind: 'begin-battle', firstPlayerId: previewUserId }]
    for (let round = 0; round < 5; round++) {
      if (round) tail.push({ kind: 'settle-opponent-turn' })
      for (const playerId of [previewUserId, opponentUserId]) {
        for (let phase = 0; phase < 6; phase++) {
          tail.push(
            { kind: 'score', category: 'primary', delta: 1, playerId },
            { kind: 'score', category: 'secondary', delta: 1, playerId },
            { kind: 'correct-player', playerId, resource: 'cp', delta: 1 },
            { kind: 'correct-player', playerId, resource: 'cp', delta: -1 },
            { kind: 'advance', playerId },
          )
        }
        if (playerId === previewUserId) tail.push({ kind: 'settle-opponent-turn' })
      }
    }
    tail.push({ kind: 'score-settlement', round: 5, scores: [{ category: 'primary', delta: 5 }] }, { kind: 'settle-opponent-turn' })
    await createCasualBattle({
      id: 'preview-stress-replay',
      token: 'preview-stress-replay',
      creatorId: previewUserId,
      opponentIds: [opponentUserId],
      limit: 2_000,
      rosters: [
        [previewUserId, 'preview-necrons-cursed-skyshroud'],
        [opponentUserId, 'preview-opponent-orks'],
      ],
      tail,
    })
  }

  await createRevealedLeague({
    id: 'preview-league-duel',
    token: 'preview-league-duel',
    eventId: 'preview-event-duel',
    eventToken: 'preview-event-duel',
    ownerId: previewUserId,
    name: 'Weeknight Strike Force',
    description: 'A finished 1v1 event with revealed rosters and a completed battle.',
    visibility: 'public',
    format: '1v1',
    entries: [
      { userId: previewUserId, rosterId: 'preview-necrons-cursed-skyshroud' },
      { userId: opponentUserId, rosterId: 'preview-opponent-orks' },
    ],
    battle: {
      id: 'preview-league-battle-duel',
      token: 'preview-league-battle-duel',
      creatorId: previewUserId,
      opponentIds: [opponentUserId],
      tail: [
        { kind: 'begin-battle', firstPlayerId: previewUserId },
        ...Array.from({ length: 5 }, (_, round) => [
          ...(round ? [{ kind: 'settle-opponent-turn' as const }] : []),
          ...(round < 4 ? [{ kind: 'score' as const, category: 'primary' as const, delta: 5 }] : []),
          ...Array.from({ length: 6 }, () => ({ kind: 'advance' as const, playerId: previewUserId })),
          { kind: 'settle-opponent-turn' as const },
          ...Array.from({ length: 6 }, () => ({ kind: 'advance' as const, playerId: opponentUserId })),
        ]).flat(),
        { kind: 'score-settlement', round: 5, scores: [{ category: 'primary', delta: 5 }] },
        { kind: 'settle-opponent-turn' },
      ],
    },
  })
  await createRevealedLeague({
    id: 'preview-league-solo-pair',
    token: 'preview-league-solo-pair',
    eventId: 'preview-event-solo-pair',
    eventToken: 'preview-event-solo-pair',
    ownerId: previewUserId,
    name: 'Solo vs Pair Trial',
    description: 'A live 2v1 event with one Strike Force roster facing two Incursion rosters.',
    visibility: 'private',
    format: '2v1',
    entries: [
      { userId: previewUserId, rosterId: 'preview-astra-militarum-combined-arms', requiredLimit: 2_000 },
      { userId: opponentUserId, rosterId: 'preview-opponent-tyranids', requiredLimit: 1_000, teamId: 'preview-solo-pair-allies' },
      { userId: allyUserId, rosterId: 'preview-ally-death-guard', requiredLimit: 1_000, teamId: 'preview-solo-pair-allies' },
    ],
    battle: {
      id: 'preview-league-battle-solo-pair',
      token: 'preview-league-battle-solo-pair',
      creatorId: previewUserId,
      opponentIds: [opponentUserId, allyUserId],
      tail: [{ kind: 'begin-battle', firstPlayerId: allyUserId }],
    },
  })
  await createRevealedLeague({
    id: 'preview-league-doubles',
    token: 'preview-league-doubles',
    eventId: 'preview-event-doubles',
    eventToken: 'preview-event-doubles',
    ownerId: opponentUserId,
    name: 'Doubles Open',
    description: 'A revealed 2v2 event ready to test team seating, sealed rosters, and spectators.',
    visibility: 'public',
    format: '2v2',
    entries: [
      { userId: previewUserId, rosterId: 'preview-space-marines-gladius', teamId: 'preview-team-one' },
      { userId: allyUserId, rosterId: 'preview-ally-space-marines', teamId: 'preview-team-one' },
      { userId: opponentUserId, rosterId: 'preview-opponent-tyranids', teamId: 'preview-team-two' },
      { userId: rivalUserId, rosterId: 'preview-rival-tyranids', teamId: 'preview-team-two' },
    ],
    battle: {
      id: 'preview-league-battle-doubles',
      token: 'preview-league-battle-doubles',
      creatorId: previewUserId,
      allyIds: [allyUserId],
      opponentIds: [opponentUserId, rivalUserId],
      tail: [{ kind: 'set-setup-step', step: 2 }],
    },
  })
  await createOpenLeague()
  await createSwissTournament()
  await createClubs()
  await createClubSeasons()
  return [...ids.values()]

  /**
   * A Swiss tournament two rounds in: round 1 played out around a bye, and in round 2 one table finished, the login's
   * battle under way and another bye, so its rounds, results, battles and status card read as they do mid-event.
   */
  async function createSwissTournament() {
    const token = 'preview-league-swiss'
    const eventToken = 'preview-event-swiss'
    await createRevealedLeague({
      id: token,
      token,
      eventId: eventToken,
      eventToken,
      ownerId: previewUserId,
      name: 'Autumn Swiss',
      description: 'Three Swiss rounds at 2,000 points, paired each evening once every table has finished.',
      visibility: 'public',
      format: '1v1',
      rounds: 3,
      entries: [
        { userId: previewUserId, rosterId: 'preview-necrons-cursed-skyshroud' },
        { userId: opponentUserId, rosterId: 'preview-opponent-orks' },
        { userId: allyUserId, rosterId: 'preview-ally-astra-militarum' },
        { userId: rivalUserId, rosterId: 'preview-rival-orks' },
        { userId: strangerUserId, rosterId: 'preview-stranger-aeldari' },
      ],
    })
    const rounds: [string, string | null, Command[]][][] = [
      [
        [previewUserId, opponentUserId, finished(previewUserId, opponentUserId, [72, 58])],
        [allyUserId, rivalUserId, finished(rivalUserId, allyUserId, [66, 61])],
        [strangerUserId, null, []],
      ],
      [
        [previewUserId, rivalUserId, [{ kind: 'begin-battle', firstPlayerId: previewUserId }]],
        [opponentUserId, strangerUserId, finished(strangerUserId, opponentUserId, [70, 64])],
        [allyUserId, null, []],
      ],
    ]
    for (const [index, tables] of rounds.entries()) {
      const round = index + 1
      const league = await repository.leagueByToken(token, previewUserId, eventToken)
      if (!league?.pairings.some((pairing) => pairing.round === round)) {
        const paired = await repository.pairLeagueRound({
          token,
          eventToken,
          ownerId: previewUserId,
          round,
          pairs: tables.map(([aId, bId]) => [aId, bId]),
        })
        if (paired !== 'paired') throw new Error(`Autumn Swiss round ${round} could not be paired: ${paired}`)
      }
      for (const [table, [aId, bId, tail]] of tables.entries()) {
        const battleToken = `preview-league-swiss-battle-${round}-${table + 1}`
        if (!bId || (await repository.battleByToken(battleToken))) continue
        await repository.createLeagueBattle(
          { id: battleToken, token: battleToken, leagueToken: token, eventToken, userId: aId, userIds: [aId, bId], now: now() },
          (setup) => {
            const built = buildLeagueBattle(setup, aId, bId, null, battleToken)
            return { ...built, initialCommands: [...built.initialCommands, ...tail] }
          },
        )
      }
    }
  }

  function finished(winnerId: string, loserId: string, scores: [number, number]): Command[] {
    return [
      { kind: 'begin-battle', firstPlayerId: winnerId },
      { kind: 'score', category: 'primary', delta: scores[0], playerId: winnerId },
      { kind: 'score', category: 'primary', delta: scores[1], playerId: loserId },
      { kind: 'end-battle', reason: 'conceded', concededBy: loserId },
    ]
  }

  /**
   * A published season in the login's club, part played: finished games, one under way, an overdue round, a round still
   * due and rounds with no deadline; and a draft in Sam's open club, for its owner to review and the login to join.
   */
  async function createClubSeasons() {
    const day = 86_400_000
    const token = 'preview-club'
    const rosters = new Map([
      [previewUserId, 'preview-necrons-cursed-skyshroud'],
      [allyUserId, 'preview-ally-astra-militarum'],
      [opponentUserId, 'preview-opponent-orks'],
      [rivalUserId, 'preview-rival-orks'],
      [strangerUserId, 'preview-stranger-aeldari'],
    ])
    const entrants = [...rosters.keys()]
    if (!(await repository.clubByToken(token))?.season) {
      await repository.drawClubSeason(token, previewUserId, { seasonId: 'preview-club-season', seed: 1, now: now() })
      for (const userId of entrants) await repository.joinClubSeason(token, userId, now())
      await repository.publishClubSeason(token, previewUserId, { seed: 1, playerIds: entrants, now: now() })
      await repository.setClubSeasonDeadline(token, previewUserId, 1, now() - day)
      await repository.setClubSeasonDeadline(token, previewUserId, 2, now() + 7 * day)
      const fixtures = (await repository.clubByToken(token))!.season!.fixtures.filter((fixture) => fixture.bId !== null)
      // The login's own fixtures stay to play, one of them overdue, and the battle under way leaves out the opponent and
      // the ally, so their cards show a season game and a list to seal.
      const others = fixtures.filter((fixture) => fixture.aId !== previewUserId && fixture.bId !== previewUserId)
      const finishedResults: [number, number][] = [
        [64, 51],
        [72, 70],
        [55, 38],
      ]
      const played = others.slice(0, finishedResults.length)
      const underWay = others.find(
        (fixture) => !played.includes(fixture) && ![fixture.aId, fixture.bId].some((id) => id === opponentUserId || id === allyUserId),
      )
      for (const [index, fixture] of [...played, ...(underWay ? [underWay] : [])].entries()) {
        const result = finishedResults[index]
        await repository.createBattle({
          id: index ? `preview-club-season-battle-${index}` : 'preview-club-season-battle',
          token: index ? `preview-club-season-battle-${index}` : 'preview-club-season-battle',
          userId: fixture.aId,
          allyIds: [],
          opponentIds: [fixture.bId!],
          initialCommands: battleCommands(
            2_000,
            [
              [fixture.aId, rosters.get(fixture.aId)!],
              [fixture.bId!, rosters.get(fixture.bId!)!],
            ],
            [
              { kind: 'set-battle-club', clubId: token },
              ...(result ? finished(fixture.aId, fixture.bId!, result) : [{ kind: 'begin-battle', firstPlayerId: fixture.aId } as Command]),
            ],
          ),
          now: now(),
          fixtureKey: fixture.key,
        })
      }
    }
    const open = 'preview-club-open'
    if (!(await repository.clubByToken(open))?.season) {
      for (const userId of [opponentUserId, rivalUserId, previewUserId]) await repository.joinClub(open, userId, now())
      await repository.drawClubSeason(open, wandererUserId, { seasonId: 'preview-club-open-season', seed: 2, now: now() })
      for (const userId of [wandererUserId, strangerUserId, opponentUserId, rivalUserId])
        await repository.joinClubSeason(open, userId, now())
    }
  }

  /**
   * A club the preview login runs, with every state its page shows: a join request, an admin, finished, live and
   * unstarted club battles, more past sealed games than the page lists at first, a doubles game being played, a
   * solo-vs-pair game still taking seats, and a duel waiting on the login's list. An empty club it has just started and
   * one with revealed lists for it to play show the other ends of the page; two clubs it is not in show the joining side.
   */
  async function createClubs() {
    const token = 'preview-club'
    const day = 86_400_000
    // Each step checks what exists, so a run that stopped partway picks up where it left off.
    if (!(await repository.clubByToken(token)))
      await repository.createClub({
        id: token,
        token,
        ownerId: previewUserId,
        name: 'Thursday Night Wargamers',
        description: 'We meet Thursdays from 7pm in the back room of the Dice Tower. Bring 2,000-point lists; tables and terrain provided.',
        visibility: 'public',
        admission: 'approval',
        now: now(),
      })
    for (const userId of [allyUserId, opponentUserId, rivalUserId, strangerUserId]) {
      await repository.joinClub(token, userId, now())
      await repository.moderateClubMember(token, previewUserId, userId, true)
    }
    await repository.setClubAdmins(token, previewUserId, [allyUserId])
    await repository.joinClub(token, wandererUserId, now())

    const clubBattles: [string, string, string, string, string, Command[]][] = [
      [
        'opponent-rival',
        opponentUserId,
        'preview-opponent-orks',
        rivalUserId,
        'preview-rival-orks',
        finished(opponentUserId, rivalUserId, [62, 48]),
      ],
      [
        'preview-opponent',
        previewUserId,
        'preview-necrons-cursed-skyshroud',
        opponentUserId,
        'preview-opponent-aeldari',
        finished(previewUserId, opponentUserId, [71, 55]),
      ],
      [
        'stranger-rival',
        strangerUserId,
        'preview-stranger-aeldari',
        rivalUserId,
        'preview-rival-orks',
        finished(rivalUserId, strangerUserId, [58, 40]),
      ],
      [
        'ally-stranger',
        allyUserId,
        'preview-ally-astra-militarum',
        strangerUserId,
        'preview-stranger-necrons',
        finished(allyUserId, strangerUserId, [80, 44]),
      ],
      [
        'preview-ally',
        previewUserId,
        'preview-necrons-cursed-skyshroud',
        allyUserId,
        'preview-ally-astra-militarum',
        finished(allyUserId, previewUserId, [67, 63]),
      ],
      ['rival-stranger', rivalUserId, 'preview-rival-orks', strangerUserId, 'preview-stranger-necrons', []],
      [
        'preview-rival',
        previewUserId,
        'preview-astra-militarum-combined-arms',
        rivalUserId,
        'preview-rival-orks',
        [{ kind: 'begin-battle', firstPlayerId: rivalUserId }],
      ],
    ]
    for (const [key, creatorId, creatorRoster, opponentId, opponentRoster, tail] of clubBattles) {
      await createCasualBattle({
        id: `preview-club-battle-${key}`,
        token: `preview-club-battle-${key}`,
        creatorId,
        opponentIds: [opponentId],
        limit: 2_000,
        rosters: [
          [creatorId, creatorRoster],
          [opponentId, opponentRoster],
        ],
        tail: [{ kind: 'set-battle-club', clubId: token }, ...tail],
      })
    }

    await createClubGame({
      key: 'duel-september',
      format: '1v1',
      schedule: { playsAt: now() - 35 * day, sealBy: null },
      seats: [
        { userId: allyUserId, rosterId: 'preview-ally-astra-militarum' },
        { userId: strangerUserId, rosterId: 'preview-stranger-necrons' },
      ],
      reveal: true,
      battles: [
        { key: 'ally-stranger', userId: allyUserId, opponentId: strangerUserId, tail: finished(strangerUserId, allyUserId, [59, 57]) },
      ],
    })
    await createClubGame({
      key: 'duel-october',
      format: '1v1',
      schedule: { playsAt: now() - 14 * day, sealBy: null },
      seats: [
        { userId: previewUserId, rosterId: 'preview-astra-militarum-combined-arms' },
        { userId: allyUserId, rosterId: 'preview-ally-astra-militarum' },
        { userId: rivalUserId, rosterId: 'preview-rival-orks' },
        { userId: strangerUserId, rosterId: 'preview-stranger-aeldari' },
      ],
      reveal: true,
      battles: [
        { key: 'october-preview-ally', userId: previewUserId, opponentId: allyUserId, tail: finished(previewUserId, allyUserId, [78, 60]) },
        {
          key: 'october-rival-stranger',
          userId: rivalUserId,
          opponentId: strangerUserId,
          tail: finished(rivalUserId, strangerUserId, [66, 49]),
        },
        {
          key: 'october-preview-rival',
          userId: previewUserId,
          opponentId: rivalUserId,
          tail: finished(rivalUserId, previewUserId, [70, 52]),
        },
      ],
    })
    await createClubGame({
      key: 'duel-past',
      format: '1v1',
      schedule: { playsAt: now() - 7 * day, sealBy: null },
      seats: [
        { userId: previewUserId, rosterId: 'preview-necrons-cursed-skyshroud' },
        { userId: opponentUserId, rosterId: 'preview-opponent-orks' },
        { userId: rivalUserId, rosterId: 'preview-rival-orks' },
      ],
      reveal: true,
      battles: [
        {
          key: 'preview-opponent',
          userId: previewUserId,
          opponentId: opponentUserId,
          tail: finished(opponentUserId, previewUserId, [66, 52]),
        },
        { key: 'opponent-rival', userId: opponentUserId, opponentId: rivalUserId, tail: finished(opponentUserId, rivalUserId, [70, 61]) },
      ],
    })
    await createClubGame({
      key: 'doubles',
      format: '2v2',
      schedule: { playsAt: now(), sealBy: null },
      seats: [
        { userId: previewUserId, rosterId: 'preview-space-marines-gladius', side: 'team-1' },
        { userId: allyUserId, rosterId: 'preview-ally-space-marines', side: 'team-1' },
        { userId: opponentUserId, rosterId: 'preview-opponent-tyranids', side: 'team-2' },
        { userId: rivalUserId, rosterId: 'preview-rival-tyranids', side: 'team-2' },
      ],
      reveal: true,
      battles: [
        {
          key: 'doubles',
          userId: previewUserId,
          opponentId: opponentUserId,
          tail: [{ kind: 'begin-battle', firstPlayerId: previewUserId }],
        },
      ],
    })
    await createClubGame({
      key: 'solo-pair',
      format: '2v1',
      schedule: { playsAt: now() + 7 * day, sealBy: now() + 6 * day },
      seats: [
        { userId: previewUserId, rosterId: 'preview-astra-militarum-combined-arms', side: 'solo' },
        { userId: allyUserId, rosterId: 'preview-ally-death-guard', side: 'pair' },
      ],
      reveal: false,
      battles: [],
    })
    await createClubGame({
      key: 'duel-open',
      format: '1v1',
      schedule: { playsAt: now() + 3 * day, sealBy: now() + 2 * day },
      seats: [
        { userId: opponentUserId, rosterId: 'preview-opponent-aeldari' },
        { userId: strangerUserId, rosterId: 'preview-stranger-necrons' },
      ],
      reveal: false,
      battles: [],
    })

    // A club the login has just started, with nothing in it yet, and one where revealed lists wait for it to play them.
    if (!(await repository.clubByToken('preview-club-new'))) {
      await repository.createClub({
        id: 'preview-club-new',
        token: 'preview-club-new',
        ownerId: previewUserId,
        name: 'Wednesday Starters',
        description: 'Learn-to-play nights for new players. Bring a small army or borrow one of ours.',
        visibility: 'private',
        admission: 'automatic',
        now: now(),
      })
      await repository.joinClub('preview-club-new', allyUserId, now())
    }
    const friday = 'preview-club-friday'
    if (!(await repository.clubByToken(friday))) {
      await repository.createClub({
        id: friday,
        token: friday,
        ownerId: allyUserId,
        name: 'Friday Night Fights',
        description: 'One sealed duel a week. Play whoever you like from the revealed lists.',
        visibility: 'public',
        admission: 'automatic',
        now: now(),
      })
      for (const userId of [previewUserId, opponentUserId, rivalUserId]) await repository.joinClub(friday, userId, now())
    }
    await createClubGame({
      key: 'friday-duel',
      club: { token: friday, ownerId: allyUserId },
      format: '1v1',
      schedule: { playsAt: now(), sealBy: null },
      seats: [
        { userId: previewUserId, rosterId: 'preview-necrons-cursed-skyshroud' },
        { userId: opponentUserId, rosterId: 'preview-opponent-orks' },
        { userId: rivalUserId, rosterId: 'preview-rival-orks' },
      ],
      reveal: true,
      battles: [
        {
          key: 'friday-opponent-rival',
          userId: opponentUserId,
          opponentId: rivalUserId,
          tail: finished(rivalUserId, opponentUserId, [74, 69]),
        },
      ],
    })

    if (await repository.clubByToken('preview-club-garage')) return
    await repository.createClub({
      id: 'preview-club-garage',
      token: 'preview-club-garage',
      ownerId: strangerUserId,
      name: 'Kieran’s Garage League',
      description: 'Invite-only Sunday games in Kieran’s garage. Ask to join and he’ll let you in.',
      visibility: 'public',
      admission: 'approval',
      now: now(),
    })
    await repository.joinClub('preview-club-garage', wandererUserId, now())
    await repository.moderateClubMember('preview-club-garage', strangerUserId, wandererUserId, true)
    await repository.joinClub('preview-club-garage', previewUserId, now())
    await repository.createClub({
      id: 'preview-club-open',
      token: 'preview-club-open',
      ownerId: wandererUserId,
      name: 'Open Table Saturdays',
      description: 'Drop-in games at the community hall. Anyone can join.',
      visibility: 'public',
      admission: 'automatic',
      now: now(),
    })
    await repository.joinClub('preview-club-open', strangerUserId, now())

    async function createClubGame(game: {
      key: string
      /** The login's own club unless named. */
      club?: { token: string; ownerId: string }
      format: '1v1' | '2v1' | '2v2'
      schedule: { playsAt: number | null; sealBy: number | null }
      seats: { userId: string; rosterId: string; side?: LeagueSide }[]
      reveal: boolean
      battles: { key: string; userId: string; opponentId: string; tail: Command[] }[]
    }) {
      const gameToken = `preview-club-game-${game.key}`
      const { token: clubToken, ownerId } = game.club ?? { token, ownerId: previewUserId }
      const existing = await repository.leagueByToken(gameToken, ownerId)
      const current = existing && (await repository.clubByToken(clubToken))?.games.find((candidate) => candidate.token === gameToken)
      if (current && !clubGameOpen(current, Date.now())) return
      if (!existing) {
        const created = await repository.createClubGame({
          eventId: gameToken,
          eventToken: gameToken,
          clubToken,
          ownerId,
          format: game.format,
          rosterLimit: 2_000,
          schedule: game.reveal ? { playsAt: null, sealBy: null } : game.schedule,
          now: now(),
        })
        if (created) throw new Error(`club game ${game.key} could not be created: ${created}`)
      }
      if (!existing?.revealedAt) await sealClubGame(gameToken, game, ownerId)
      for (const battle of game.battles) {
        const battleToken = `preview-club-game-battle-${battle.key}`
        if (await repository.battleByToken(battleToken)) continue
        const userIds = game.format === '1v1' ? [battle.userId, battle.opponentId] : game.seats.map((seat) => seat.userId)
        await repository.createLeagueBattle(
          { id: battleToken, token: battleToken, leagueToken: gameToken, userId: battle.userId, userIds, now: now() },
          (league) => {
            const built = buildLeagueBattle(league, battle.userId, battle.opponentId, null, battleToken)
            return { ...built, initialCommands: [...built.initialCommands, ...battle.tail] }
          },
        )
      }
      if (!existing && game.reveal) await repository.updateLeague(gameToken, ownerId, { schedule: game.schedule })
    }

    /** Seats every player before anyone seals, since a doubles list only seals once its partner is seated. */
    async function sealClubGame(
      gameToken: string,
      game: { key: string; seats: { userId: string; rosterId: string; side?: LeagueSide }[]; reveal: boolean },
      ownerId: string,
    ) {
      for (const seat of game.seats) {
        if (!seat.side) continue
        const result = await repository.chooseLeagueSide(gameToken, seat.userId, seat.side, now())
        if (result !== 'updated') throw new Error(`club game ${game.key} could not seat a player: ${result}`)
      }
      for (const seat of game.seats) {
        const saved = await repository.roster(seat.rosterId)
        if (!saved) throw new Error(`${seat.rosterId} was not saved`)
        const result = await repository.submitLeagueRoster({
          token: gameToken,
          userId: seat.userId,
          rosterId: saved.id,
          rosterName: saved.name,
          rosterLimit: saved.limit,
          rosterUpdatedAt: saved.updatedAt,
          snapshot: JSON.stringify(snapshot(saved.id)),
          now: now(),
        })
        if (result.outcome !== 'sealed') throw new Error(`club game ${game.key} could not seal ${saved.name}: ${result.outcome}`)
      }
      if (!game.reveal) return
      for (const seat of game.seats) {
        const team = (await repository.leagueByToken(gameToken, seat.userId))?.entries.find((entry) => entry.userId === seat.userId)?.team
        if (!team) continue
        if (!team.disposition && team.choices[0]) await repository.setLeagueTeamDisposition(gameToken, seat.userId, team.choices[0], now())
        if (!team.warlord && team.warlordChoices[0])
          await repository.setLeagueTeamWarlord(gameToken, seat.userId, team.warlordChoices[0], now())
      }
      const reveal = await repository.revealLeague(gameToken, ownerId, now())
      if (reveal.outcome !== 'revealed') throw new Error(`club game ${game.key} could not be revealed: ${reveal.outcome}`)
    }
  }

  async function ensurePreviewUser(email: string, password: string, name: string) {
    let id = await userIdByEmail(email)
    if (!id) {
      await auth.api.signUpEmail({ body: { email, password, name } })
      id = await userIdByEmail(email)
    }
    if (!id) throw new Error(`${name} account was not created`)
    return id
  }

  function accountId(email: string) {
    const id = ids.get(email)
    if (!id) throw new Error(`${email} account was not created`)
    return id
  }

  async function befriend(leftId: string, rightId: string) {
    const existing = (await repository.relationships(leftId)).find((row) => row.otherId === rightId)
    if (!existing) await repository.requestFriend(leftId, rightId, now())
    const friendship = (await repository.relationships(leftId)).find((row) => row.otherId === rightId)
    if (friendship?.acceptedAt === null) await repository.acceptFriend(friendship.requesterId, friendship.addresseeId, now())
  }

  async function saveRoster(roster: PreviewRoster, userId: string) {
    if (await repository.roster(roster.id)) return
    await repository.saveRoster({
      ...rosterRow({ ...roster, prep: null }),
      userId,
      visibility: 'private',
      source: 'editable',
      now: now(),
    })
  }

  function snapshot(rosterId: string) {
    const found = snapshots.get(rosterId)
    if (!found) throw new Error(`no preview snapshot for ${rosterId}`)
    return found
  }

  function battleCommands(limit: number, rosters: readonly (readonly [string, string])[], tail: readonly Command[]) {
    const teamBattle = rosters.length > 2
    return [
      {
        kind: 'configure-battle' as const,
        limit,
        missionPackId: null,
        terrainLayoutId: null,
        twistId: null,
        teamBattle,
        playerCount: rosters.length as 2 | 3 | 4,
        clockLimitMinutes: null,
      },
      ...rosters.map(([playerId, rosterId], index) => ({
        kind: 'attach-roster' as const,
        playerId,
        roster: snapshot(rosterId),
        prep: null,
        painted: index % 2 === 0,
      })),
      ...tail,
    ] satisfies Command[]
  }

  async function createCasualBattle(input: {
    id: string
    token: string
    creatorId: string
    allyIds?: string[]
    opponentIds: string[]
    limit: number
    rosters: readonly (readonly [string, string])[]
    tail: readonly Command[]
  }) {
    if (await repository.battleByToken(input.token)) return
    await repository.createBattle({
      id: input.id,
      token: input.token,
      userId: input.creatorId,
      allyIds: input.allyIds ?? [],
      opponentIds: input.opponentIds,
      initialCommands: battleCommands(input.limit, input.rosters, [
        ...sideWarlords([[input.creatorId, ...(input.allyIds ?? [])], input.opponentIds]),
        ...input.tail,
      ]),
      now: now(),
    })
  }

  /** Allies each bring a Warlord, so a seeded side of allies names its first seat's to lead it. */
  function sideWarlords(sides: readonly (readonly string[])[]): Command[] {
    return sides.flatMap((playerIds, side) =>
      playerIds.length > 1 ? [{ kind: 'set-side-warlord' as const, side, playerId: playerIds[0]! }] : [],
    )
  }

  async function createRevealedLeague(input: {
    id: string
    token: string
    eventId: string
    eventToken: string
    ownerId: string
    name: string
    description: string
    visibility: 'public' | 'private'
    format: '1v1' | '2v1' | '2v2'
    rounds?: number
    entries: { userId: string; rosterId: string; requiredLimit?: number; teamId?: string }[]
    /** A battle to start once the rosters are out; a Swiss event's come from its pairings instead. */
    battle?: {
      id: string
      token: string
      creatorId: string
      allyIds?: string[]
      opponentIds: string[]
      tail: readonly Command[]
    }
  }) {
    if (!(await repository.leagueByToken(input.token, input.ownerId, input.eventToken))) {
      await repository.createTournament({
        id: input.id,
        token: input.token,
        eventId: input.eventId,
        eventToken: input.eventToken,
        ownerId: input.ownerId,
        name: input.name,
        description: input.description,
        visibility: input.visibility,
        admission: 'automatic',
        playerLimit: input.entries.length,
        format: input.format,
        rosterLimit: 2_000,
        rounds: input.rounds ?? null,
        now: now(),
      })
    }
    const league = await repository.leagueByToken(input.token, input.ownerId, input.eventToken)
    if (!league) throw new Error(`${input.name} was not created`)
    if (league.revealedAt === null) {
      for (const entry of input.entries) await repository.joinLeague(input.token, entry.userId, now(), 128, input.eventToken)
      for (const entry of input.entries) {
        if (entry.requiredLimit) {
          await repository.assignLeagueRosterRequirement(input.token, input.ownerId, entry.userId, entry.requiredLimit, input.eventToken)
        }
      }
      const teams = new Map<string, typeof input.entries>()
      for (const entry of input.entries) {
        if (!entry.teamId) continue
        const members = teams.get(entry.teamId) ?? []
        members.push(entry)
        teams.set(entry.teamId, members)
      }
      for (const [teamId, entries] of teams) {
        await repository.assignLeagueTeam(
          input.token,
          input.ownerId,
          entries.map((entry) => entry.userId),
          teamId,
          input.eventToken,
        )
      }
      for (const entry of input.entries) {
        const saved = await repository.roster(entry.rosterId)
        if (!saved) throw new Error(`${entry.rosterId} was not saved`)
        const result = await repository.submitLeagueRoster({
          token: input.token,
          eventToken: input.eventToken,
          userId: entry.userId,
          rosterId: saved.id,
          rosterName: saved.name,
          rosterLimit: saved.limit,
          rosterUpdatedAt: saved.updatedAt,
          snapshot: JSON.stringify(snapshot(saved.id)),
          now: now(),
        })
        if (result.outcome !== 'sealed') throw new Error(`${saved.name} could not be sealed: ${result.outcome}`)
      }
      // A pair whose lists chose different cards settles its one Force Disposition before the reveal.
      for (const entry of input.entries) {
        if (!entry.teamId) continue
        const team = (await repository.leagueByToken(input.token, entry.userId, input.eventToken))?.entries.find(
          (candidate) => candidate.userId === entry.userId,
        )?.team
        if (!team) continue
        if (!team.disposition && team.choices[0]) {
          const result = await repository.setLeagueTeamDisposition(input.token, entry.userId, team.choices[0], now(), input.eventToken)
          if (result.outcome !== 'chosen') throw new Error(`${input.name} could not settle a Force Disposition: ${result.outcome}`)
        }
        if (!team.warlord && team.warlordChoices[0]) {
          const result = await repository.setLeagueTeamWarlord(input.token, entry.userId, team.warlordChoices[0], now(), input.eventToken)
          if (result.outcome !== 'chosen') throw new Error(`${input.name} could not settle a Warlord: ${result.outcome}`)
        }
      }
      const reveal = await repository.revealLeague(input.token, input.ownerId, now(), input.eventToken)
      if (reveal.outcome !== 'revealed') throw new Error(`${input.name} could not be revealed: ${reveal.outcome}`)
    }
    if (!input.battle || (await repository.battleByToken(input.battle.token))) return
    const { battle } = input
    const battleRosters = input.entries.map((entry) => [entry.userId, entry.rosterId] as const)
    const revealedEntries = (await repository.leagueByToken(input.token, input.ownerId, input.eventToken))?.entries ?? []
    const sides = [[battle.creatorId, ...(battle.allyIds ?? [])], battle.opponentIds]
    const dispositions = sides.flatMap((playerIds, side) => {
      const disposition = playerIds.length > 1 ? revealedEntries.find((entry) => entry.userId === playerIds[0])?.team?.disposition : null
      return disposition ? [{ side, disposition }] : []
    })
    const warlords = sides.flatMap((playerIds, side) => {
      const playerId = playerIds.length > 1 ? revealedEntries.find((entry) => entry.userId === playerIds[0])?.team?.warlord : null
      return playerId ? [{ side, playerId }] : []
    })
    await repository.createLeagueBattle(
      {
        id: battle.id,
        token: battle.token,
        leagueToken: input.token,
        eventToken: input.eventToken,
        userId: battle.creatorId,
        userIds: input.entries.map((entry) => entry.userId),
        now: now(),
      },
      () => ({
        allyIds: battle.allyIds ?? [],
        opponentIds: battle.opponentIds,
        initialCommands: [
          ...battleCommands(2_000, battleRosters, []),
          {
            kind: 'lock-league-rosters',
            leagueToken: input.token,
            eventToken: input.eventToken,
            ...(dispositions.length ? { dispositions } : {}),
            ...(warlords.length ? { warlords } : {}),
          },
          ...battle.tail,
        ],
        result: true,
      }),
    )
  }

  async function createOpenLeague() {
    const token = 'preview-league-registration'
    const eventToken = 'preview-event-registration'
    if (await repository.leagueByToken(token, allyUserId, eventToken)) return
    await repository.createTournament({
      id: 'preview-league-registration',
      token,
      eventId: 'preview-event-registration',
      eventToken,
      ownerId: allyUserId,
      name: 'Fresh Recruits League',
      description: 'An open approval league with pending, accepted, submitted, and rejected entries.',
      visibility: 'public',
      admission: 'approval',
      playerLimit: 4,
      format: '1v1',
      rosterLimit: 1_000,
      now: now(),
    })
    await repository.joinLeague(token, previewUserId, now(), 128, eventToken)
    await repository.joinLeague(token, opponentUserId, now(), 128, eventToken)
    await repository.moderateLeagueEntry(token, allyUserId, opponentUserId, 'accepted', 128, eventToken)
    const saved = await repository.roster('preview-opponent-tyranids')
    if (!saved) throw new Error('preview-opponent-tyranids was not saved')
    const submitted = await repository.submitLeagueRoster({
      token,
      eventToken,
      userId: opponentUserId,
      rosterId: saved.id,
      rosterName: saved.name,
      rosterLimit: saved.limit,
      rosterUpdatedAt: saved.updatedAt,
      snapshot: JSON.stringify(snapshot(saved.id)),
      now: now(),
    })
    if (submitted.outcome !== 'sealed') throw new Error(`registration roster could not be sealed: ${submitted.outcome}`)
    await repository.joinLeague(token, rivalUserId, now(), 128, eventToken)
    await repository.moderateLeagueEntry(token, allyUserId, rivalUserId, 'rejected', 128, eventToken)
  }
}

if (isEntryPoint(import.meta.url)) await seedPreview()

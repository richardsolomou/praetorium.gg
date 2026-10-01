import { createHash } from 'node:crypto'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import type { Command, Roster } from '../src/core/battle'
import type { RosterPick } from '../src/core/roster'
import { rosterSnapshot } from '../src/core/rosterSnapshot'
import { account as authAccount, user } from '../src/db/authSchema'
import { createSqliteAuth } from '../src/server/sqliteAuth'
import { SqliteAccountRepository } from '../src/server/accountRepository'
import { localAuthDatabase } from '../src/server/localAuthDatabase'
import { SpacetimeOperator } from '../src/server/spacetimeOperator'
import { SpacetimeRepository } from '../src/server/spacetimeRepository'
import { unitBattleDetailsIn } from '../src/server/catalogue'
import { catalogueBaseUrl, fetchCurrentSnapshot, installedSnapshot } from '../src/server/catalogueSnapshot'
import { catalogueDirectory, loadCatalogue } from '../src/server/catalogueIndex'
import { calculateRosterPrice } from '../src/server/pricing'
import { loadRules } from '../src/server/rules'

export const PREVIEW_EMAIL = 'preview@praetorium.gg'
const PREVIEW_PASSWORD = 'preview-preview-preview'
export const PREVIEW_OPPONENT_EMAIL = 'opponent@praetorium.gg'
const PREVIEW_OPPONENT_PASSWORD = 'opponent-opponent-opponent'
export const PREVIEW_ALLY_EMAIL = 'ally@praetorium.gg'
const PREVIEW_ALLY_PASSWORD = 'ally-ally-ally-ally'
export const PREVIEW_RIVAL_EMAIL = 'rival@praetorium.gg'
const PREVIEW_RIVAL_PASSWORD = 'rival-rival-rival-rival'

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
  warlord: boolean
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
    warlord: true,
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
    catalogueId: 'e0af-67df-9d63-8fb8',
    detachmentIds: ['profile-detachment-option-e0af-67df-9d63-8fb8-f367-3240-47c1-7e1a'],
    disposition: 'priority-assets',
    limit: 1000,
    warlord: true,
    picks: [
      {
        entryId: 'profile-unit-e0af-67df-9d63-8fb8-024a-3fea-7765-4e82',
        toggles: { 'profile-warlord-e0af-67df-9d63-8fb8-024a-3fea-7765-4e82': 1 },
      },
      { entryId: 'profile-unit-e0af-67df-9d63-8fb8-e181-0a30-f8f9-ba0a' },
      { entryId: 'profile-unit-e0af-67df-9d63-8fb8-d173-3469-c40d-fd2f' },
      { entryId: 'profile-unit-e0af-67df-9d63-8fb8-34c7-75dd-fcff-ec94' },
      { entryId: 'profile-unit-e0af-67df-9d63-8fb8-e240-cd4a-f11c-5ceb' },
      { entryId: 'profile-unit-e0af-67df-9d63-8fb8-dd93-e56f-754e-f256' },
      { entryId: 'profile-unit-e0af-67df-9d63-8fb8-af06-c419-96da-a136' },
      { entryId: 'profile-unit-e0af-67df-9d63-8fb8-afd9-0b42-47ba-c215' },
      { entryId: 'profile-unit-e0af-67df-9d63-8fb8-4795-7030-3b2a-c77b' },
    ],
  },
  {
    id: 'preview-astra-militarum-combined-arms',
    name: 'Combined Arms 2K',
    catalogueId: 'b0ae-12a5-c84-ea45',
    detachmentIds: ['67ce-ebd5-b428-e4f7'],
    disposition: 'take-and-hold',
    limit: 2000,
    warlord: true,
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
    warlord: true,
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
    warlord: true,
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
    warlord: true,
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
    warlord: true,
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
    warlord: true,
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

function rosterCopy(source: PreviewRoster, id: string, warlord = source.warlord): PreviewRoster {
  return {
    ...source,
    id,
    warlord,
    picks: source.picks.map((pick) => {
      if (warlord || !pick.toggles) return { ...pick }
      const { toggles: _toggles, ...withoutToggles } = pick
      return withoutToggles
    }),
  }
}

export const PREVIEW_ROSTERS: readonly PreviewRoster[] = [
  ...PREVIEW_PLAYER_ROSTERS,
  ...PREVIEW_OPPONENT_ROSTERS.map((roster) => rosterCopy(roster, roster.id.replace('preview-opponent-', 'preview-'))),
]

export const PREVIEW_ALLY_ROSTERS: readonly PreviewRoster[] = [
  rosterCopy(PREVIEW_PLAYER_ROSTERS[3]!, 'preview-ally-death-guard'),
  rosterCopy(PREVIEW_PLAYER_ROSTERS[1]!, 'preview-ally-space-marines', false),
]

export const PREVIEW_RIVAL_ROSTERS: readonly PreviewRoster[] = [
  rosterCopy(PREVIEW_OPPONENT_ROSTERS[3]!, 'preview-rival-world-eaters'),
  rosterCopy(PREVIEW_OPPONENT_ROSTERS[1]!, 'preview-rival-tyranids', false),
]

export const PREVIEW_ACCOUNTS = [
  { email: PREVIEW_EMAIL, password: PREVIEW_PASSWORD, name: 'Preview Player', rosters: PREVIEW_ROSTERS },
  { email: PREVIEW_OPPONENT_EMAIL, password: PREVIEW_OPPONENT_PASSWORD, name: 'Preview Opponent', rosters: PREVIEW_OPPONENT_ROSTERS },
  { email: PREVIEW_ALLY_EMAIL, password: PREVIEW_ALLY_PASSWORD, name: 'Preview Ally', rosters: PREVIEW_ALLY_ROSTERS },
  { email: PREVIEW_RIVAL_EMAIL, password: PREVIEW_RIVAL_PASSWORD, name: 'Preview Rival', rosters: PREVIEW_RIVAL_ROSTERS },
] as const

const PREVIEW_ALL_ROSTERS = PREVIEW_ACCOUNTS.flatMap((account) => account.rosters)

export type PreviewSnapshots = ReadonlyMap<string, Roster>

export function previewAccountId(database: string, email: string) {
  return createHash('sha256').update(`${database}\0${email}`).digest('hex').slice(0, 32)
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
    await seedInto(
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
  } finally {
    local.client.close()
  }
}

async function verifiedSnapshots(): Promise<PreviewSnapshots> {
  const directory = process.env.CATALOGUE_DIR ? path.resolve(process.env.CATALOGUE_DIR) : catalogueDirectory()
  if (!installedSnapshot(directory)) await fetchCurrentSnapshot(directory, catalogueBaseUrl(), (message) => console.log(message))
  const catalogue = loadCatalogue(directory)
  const rules = loadRules(path.join(directory, 'rules'))
  if (!catalogue || !rules) throw new Error('the verified catalogue snapshot is incomplete')

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
      const warlords = snapshot.built?.units.filter((unit) => unit.warlord).length ?? 0
      if (warlords !== Number(saved.warlord)) throw new Error(`${saved.name} has ${warlords} Warlords, expected ${Number(saved.warlord)}`)
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
      { userId: opponentUserId, rosterId: 'preview-opponent-tyranids', requiredLimit: 1_000 },
      { userId: allyUserId, rosterId: 'preview-ally-death-guard', requiredLimit: 1_000 },
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
      id: roster.id,
      name: roster.name,
      catalogueId: roster.catalogueId,
      disposition: roster.disposition,
      limit: roster.limit,
      waivedRules: '[]',
      userId,
      detachmentId: JSON.stringify(roster.detachmentIds),
      picks: JSON.stringify(roster.picks),
      prep: null,
      tags: '[]',
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
      initialCommands: battleCommands(input.limit, input.rosters, input.tail),
      now: now(),
    })
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
    entries: { userId: string; rosterId: string; requiredLimit?: number; teamId?: string }[]
    battle: {
      id: string
      token: string
      creatorId: string
      allyIds?: string[]
      opponentIds: string[]
      tail: readonly Command[]
    }
  }) {
    if (!(await repository.leagueByToken(input.token, input.ownerId, input.eventToken))) {
      await repository.createLeague({
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
        recurring: true,
        format: input.format,
        rosterLimit: 2_000,
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
      const revealed = await repository.revealLeague(input.token, input.ownerId, now(), input.eventToken)
      if (revealed.outcome !== 'revealed') throw new Error(`${input.name} could not be revealed: ${revealed.outcome}`)
    }
    if (await repository.battleByToken(input.battle.token)) return
    const battleRosters = input.entries.map((entry) => [entry.userId, entry.rosterId] as const)
    await repository.createLeagueBattle(
      {
        id: input.battle.id,
        token: input.battle.token,
        leagueToken: input.token,
        eventToken: input.eventToken,
        userId: input.battle.creatorId,
        userIds: input.entries.map((entry) => entry.userId),
        now: now(),
      },
      () => ({
        allyIds: input.battle.allyIds ?? [],
        opponentIds: input.battle.opponentIds,
        initialCommands: [
          ...battleCommands(2_000, battleRosters, []),
          { kind: 'lock-league-rosters', leagueToken: input.token, eventToken: input.eventToken },
          ...input.battle.tail,
        ],
        result: true,
      }),
    )
  }

  async function createOpenLeague() {
    const token = 'preview-league-registration'
    const eventToken = 'preview-event-registration'
    if (await repository.leagueByToken(token, allyUserId, eventToken)) return
    await repository.createLeague({
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
      recurring: true,
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

if (import.meta.url === `file://${process.argv[1]}`) await seedPreview()

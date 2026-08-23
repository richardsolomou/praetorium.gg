import { eq } from 'drizzle-orm'
import { databaseUrl, openDatabase, type PraetoriumDatabase } from '../src/db/connection'
import { user } from '../src/db/schema'
import { Repository } from '../src/db/repository'
import { createAuth } from '../src/server/auth'

export const PREVIEW_EMAIL = 'preview@praetorium.gg'
const PREVIEW_PASSWORD = 'preview-preview-preview'
export const PREVIEW_OPPONENT_EMAIL = 'opponent@praetorium.gg'
const PREVIEW_OPPONENT_PASSWORD = 'opponent-opponent-opponent'
/** One saved list a preview account opens with, as the repository stores it. */
type PreviewRoster = {
  id: string
  name: string
  catalogueId: string
  detachmentIds: readonly string[]
  disposition: string
  limit: number
  picks: readonly { entryId: string; models?: number }[]
}

/**
 * The lists the preview player brings.
 *
 * Two Strike Forces to duel with and two Incursions for the half of the points an
 * ally of a 2v1 brings, so either format can be played through — and played again
 * with a different army — without building a list first. Every list on the instance
 * is a different faction, so a screen that draws a faction, a detachment or a
 * stratagem always has several of them to draw.
 */
export const PREVIEW_ROSTERS: readonly PreviewRoster[] = [
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
      { entryId: '77cf-f4ac-7e36-6464', models: 6 },
      { entryId: '77cf-f4ac-7e36-6464', models: 6 },
      { entryId: 'd8f0-1727-fcdd-7ee9', models: 6 },
      { entryId: 'd8f0-1727-fcdd-7ee9', models: 6 },
      { entryId: '821d-665-499f-e895', models: 10 },
      { entryId: '6733-60f-2fbe-e3bd' },
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
      { entryId: '91e3-a419-8c58-98f5' },
      { entryId: '9770-3a56-619e-f390' },
      { entryId: 'cd69-af58-774-d387' },
      { entryId: '85b1-eb9a-17a6-e5be' },
      { entryId: '85b1-eb9a-17a6-e5be' },
      { entryId: 'c432-5254-8a25-6c8a' },
      { entryId: '4c8-e877-566b-a1ee' },
      { entryId: 'fcb6-80ca-22a-4771' },
      { entryId: 'efc9-2aff-c5b-6790' },
      { entryId: '13d8-1933-472c-80ed' },
      { entryId: '3c0a-10a9-8f84-26a3' },
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
      { entryId: '10a1-5896-98da-8c7c' },
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

/** The same four for the opponent, in the four factions the player does not bring. */
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
      { entryId: '473e-73f9-493d-6a0a' },
      { entryId: '5267-f96c-4491-eebe' },
      { entryId: 'c5a3-4245-9b6a-fb8' },
      { entryId: '9af5-6820-1ff2-6c01' },
      { entryId: '6c12-6df4-9d3a-2cc' },
      { entryId: '6c12-6df4-9d3a-2cc' },
      { entryId: '8a76-5b36-455d-2c49' },
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
      { entryId: 'd160-2a74-7d96-5e9f' },
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
      { entryId: 'bc16-e600-5fe4-92e8' },
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
      { entryId: '1cfc-2dc0-2a7a-28fe' },
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

/**
 * The two accounts, lists and friendship a preview deployment opens with.
 *
 * Takes a database when one is already open — the suites pass a disposable
 * Postgres — and otherwise connects to the configured one and closes it after.
 */
/**
 * Refuses to seed anywhere it was not asked to.
 *
 * These accounts sign in with passwords printed in a public repository, so the one
 * thing this script must never do is create them somewhere real. A disposable
 * preview says so with `PRAETORIUM_SEED_PREVIEW`; a developer's own machine says so
 * by the database being on this machine. Anything else is refused rather than
 * guessed, because the cost of guessing wrong is two open doors on a live instance.
 */
function seedable(url: string) {
  if (process.env.PRAETORIUM_SEED_PREVIEW === 'true') return true
  try {
    const host = new URL(url).hostname
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === 'postgres'
  } catch {
    return false
  }
}

export async function seedPreview(provided?: PraetoriumDatabase) {
  if (provided) return seedInto(provided)
  const url = databaseUrl()
  if (!seedable(url)) {
    throw new Error('refusing to seed: DATABASE_URL is not local. Set PRAETORIUM_SEED_PREVIEW=true to seed it deliberately.')
  }
  const connection = openDatabase(url)
  try {
    await seedInto(connection.database)
  } finally {
    await connection.close()
  }
}

async function seedInto(database: PraetoriumDatabase) {
  const auth = createAuth(database, 'praetorium-disposable-preview-secret')
  const repository = new Repository(database)
  const previewUserId = await ensurePreviewUser(PREVIEW_EMAIL, PREVIEW_PASSWORD, 'Preview Player')
  const opponentUserId = await ensurePreviewUser(PREVIEW_OPPONENT_EMAIL, PREVIEW_OPPONENT_PASSWORD, 'Preview Opponent')
  for (const roster of PREVIEW_ROSTERS) await saveRoster(roster, previewUserId)
  for (const roster of PREVIEW_OPPONENT_ROSTERS) await saveRoster(roster, opponentUserId)
  await repository.requestFriend(previewUserId, opponentUserId, Date.now())
  const friendship = (await repository.relationships(previewUserId)).find((row) => row.addresseeId === opponentUserId)
  if (friendship?.acceptedAt === null) await repository.acceptFriend(previewUserId, opponentUserId, Date.now())

  async function ensurePreviewUser(email: string, password: string, name: string) {
    let [account] = await database.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1)
    if (!account) {
      await auth.api.signUpEmail({ body: { email, password, name } })
      ;[account] = await database.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1)
    }
    if (!account) throw new Error(`${name} account was not created`)
    return account.id
  }

  async function saveRoster(roster: PreviewRoster, userId: string) {
    if (await repository.roster(roster.id)) return
    await repository.saveRoster({
      id: roster.id,
      name: roster.name,
      catalogueId: roster.catalogueId,
      disposition: roster.disposition,
      limit: roster.limit,
      userId,
      detachmentId: JSON.stringify(roster.detachmentIds),
      picks: JSON.stringify(roster.picks),
      prep: null,
      tags: '[]',
      visibility: 'private',
      source: 'editable',
      now: Date.now(),
    })
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await seedPreview()

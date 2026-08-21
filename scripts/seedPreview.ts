import { eq } from 'drizzle-orm'
import { databaseUrl, openDatabase, type PraetoriumDatabase } from '../src/db/connection'
import { user } from '../src/db/schema'
import { Repository } from '../src/db/repository'
import { createAuth } from '../src/server/auth'

export const PREVIEW_EMAIL = 'preview@praetorium.gg'
const PREVIEW_PASSWORD = 'preview-preview-preview'
export const PREVIEW_OPPONENT_EMAIL = 'opponent@praetorium.gg'
const PREVIEW_OPPONENT_PASSWORD = 'opponent-opponent-opponent'
export const PREVIEW_ROSTER = {
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
  prep: null,
} as const
export const PREVIEW_OPPONENT_ROSTER = {
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
  prep: null,
} as const

/**
 * The two accounts, lists and friendship a preview deployment opens with.
 *
 * Takes a database when one is already open — the suites pass a disposable
 * Postgres — and otherwise connects to the configured one and closes it after.
 */
export async function seedPreview(provided?: PraetoriumDatabase) {
  if (provided) return seedInto(provided)
  const connection = openDatabase(databaseUrl())
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
  await saveRoster(PREVIEW_ROSTER, previewUserId)
  await saveRoster(PREVIEW_OPPONENT_ROSTER, opponentUserId)
  await repository.requestFriend(previewUserId, opponentUserId, Date.now())
  const friendship = (await repository.friendships(previewUserId)).find((row) => row.addresseeId === opponentUserId)
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

  async function saveRoster(roster: typeof PREVIEW_ROSTER | typeof PREVIEW_OPPONENT_ROSTER, userId: string) {
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

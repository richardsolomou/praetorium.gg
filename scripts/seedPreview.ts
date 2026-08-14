import { eq } from 'drizzle-orm'
import { closeDatabase, databasePath, openDatabase } from '../src/db/connection'
import { user } from '../src/db/schema'
import { Repository } from '../src/db/repository'
import { createAuth } from '../src/server/auth'

export const PREVIEW_EMAIL = 'preview@praetorium.gg'
export const PREVIEW_PASSWORD = 'preview-preview-preview'
const PREVIEW_PLAYER_ID = 'preview-player'
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

export async function seedPreview() {
  const database = openDatabase(databasePath())
  try {
    let preview = database.select({ id: user.id }).from(user).where(eq(user.email, PREVIEW_EMAIL)).get()
    if (!preview) {
      const auth = createAuth(database, 'praetorium-disposable-preview-secret')
      await auth.api.signUpEmail({ body: { email: PREVIEW_EMAIL, password: PREVIEW_PASSWORD, name: 'Preview Player' } })
      preview = database.select({ id: user.id }).from(user).where(eq(user.email, PREVIEW_EMAIL)).get()
    }
    if (!preview) throw new Error('preview account was not created')

    const repository = new Repository(database)
    const player = repository.playerByUserId(preview.id)
    if (!player) repository.upsertPlayer({ id: PREVIEW_PLAYER_ID, name: 'Preview Player', userId: preview.id, now: Date.now() })
    if (!repository.roster(PREVIEW_ROSTER.id)) {
      repository.saveRoster({
        id: PREVIEW_ROSTER.id,
        name: PREVIEW_ROSTER.name,
        catalogueId: PREVIEW_ROSTER.catalogueId,
        disposition: PREVIEW_ROSTER.disposition,
        limit: PREVIEW_ROSTER.limit,
        playerId: player?.id ?? PREVIEW_PLAYER_ID,
        detachmentId: JSON.stringify(PREVIEW_ROSTER.detachmentIds),
        picks: JSON.stringify(PREVIEW_ROSTER.picks),
        prep: null,
        tags: '[]',
        visibility: 'private',
        source: 'editable',
        now: Date.now(),
      })
    }
  } finally {
    closeDatabase(database)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await seedPreview()

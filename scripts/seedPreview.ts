import { eq } from 'drizzle-orm'
import { closeDatabase, databasePath, openDatabase } from '../src/db/connection'
import { user } from '../src/db/schema'
import { Repository } from '../src/db/repository'
import { createAuth } from '../src/server/auth'

export const PREVIEW_EMAIL = 'preview@praetorium.gg'
const PREVIEW_PASSWORD = 'preview-preview-preview'
const PREVIEW_PLAYER_ID = 'preview-player'
export const PREVIEW_OPPONENT_EMAIL = 'opponent@praetorium.gg'
const PREVIEW_OPPONENT_PASSWORD = 'opponent-opponent-opponent'
const PREVIEW_OPPONENT_PLAYER_ID = 'preview-opponent'
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
export const PREVIEW_OPPONENT_ROSTER = { ...PREVIEW_ROSTER, id: 'preview-opponent-necrons', name: 'Opponent Cursed Skyshroud 2K' } as const

export async function seedPreview() {
  const database = openDatabase(databasePath())
  try {
    const auth = createAuth(database, 'praetorium-disposable-preview-secret')
    const repository = new Repository(database)
    const previewPlayerId = await ensurePreviewPlayer(PREVIEW_EMAIL, PREVIEW_PASSWORD, 'Preview Player', PREVIEW_PLAYER_ID)
    const opponentPlayerId = await ensurePreviewPlayer(
      PREVIEW_OPPONENT_EMAIL,
      PREVIEW_OPPONENT_PASSWORD,
      'Preview Opponent',
      PREVIEW_OPPONENT_PLAYER_ID,
    )
    saveRoster(PREVIEW_ROSTER, previewPlayerId)
    saveRoster(PREVIEW_OPPONENT_ROSTER, opponentPlayerId)
    repository.requestFriend(previewPlayerId, opponentPlayerId, Date.now())
    const friendship = repository.friendships(previewPlayerId).find((row) => row.addresseeId === opponentPlayerId)
    if (friendship?.acceptedAt === null) repository.acceptFriend(previewPlayerId, opponentPlayerId, Date.now())

    async function ensurePreviewPlayer(email: string, password: string, name: string, playerId: string) {
      let account = database.select({ id: user.id }).from(user).where(eq(user.email, email)).get()
      if (!account) {
        await auth.api.signUpEmail({ body: { email, password, name } })
        account = database.select({ id: user.id }).from(user).where(eq(user.email, email)).get()
      }
      if (!account) throw new Error(`${name} account was not created`)
      const player = repository.playerByUserId(account.id)
      if (!player) repository.upsertPlayer({ id: playerId, name, userId: account.id, now: Date.now() })
      return player?.id ?? playerId
    }

    function saveRoster(roster: typeof PREVIEW_ROSTER | typeof PREVIEW_OPPONENT_ROSTER, playerId: string) {
      if (repository.roster(roster.id)) return
      repository.saveRoster({
        id: roster.id,
        name: roster.name,
        catalogueId: roster.catalogueId,
        disposition: roster.disposition,
        limit: roster.limit,
        playerId,
        detachmentId: JSON.stringify(roster.detachmentIds),
        picks: JSON.stringify(roster.picks),
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

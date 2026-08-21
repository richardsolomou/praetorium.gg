import { count, eq } from 'drizzle-orm'
import { afterEach, expect, it } from 'vitest'
import type { PraetoriumConnection } from '../src/db/connection'
import { openTestDatabase } from '../src/db/testDatabase'
import { friendships, rosters, user } from '../src/db/schema'
import { PREVIEW_EMAIL, PREVIEW_OPPONENT_EMAIL, PREVIEW_OPPONENT_ROSTER, PREVIEW_ROSTER, seedPreview } from './seedPreview'

let connection: PraetoriumConnection | undefined

afterEach(async () => {
  await connection?.close()
  connection = undefined
})

it('creates two idempotent preview accounts, rosters and their friendship', async () => {
  connection = await openTestDatabase()
  const database = connection.database

  await seedPreview(database)
  await seedPreview(database)

  const [previewAccounts] = await database.select({ count: count() }).from(user).where(eq(user.email, PREVIEW_EMAIL))
  const [opponentAccounts] = await database.select({ count: count() }).from(user).where(eq(user.email, PREVIEW_OPPONENT_EMAIL))
  const [previewRosters] = await database.select({ count: count() }).from(rosters).where(eq(rosters.id, PREVIEW_ROSTER.id))
  const [opponentRosters] = await database.select({ count: count() }).from(rosters).where(eq(rosters.id, PREVIEW_OPPONENT_ROSTER.id))
  expect(previewAccounts?.count).toBe(1)
  expect(opponentAccounts?.count).toBe(1)
  expect(previewRosters?.count).toBe(1)
  expect(opponentRosters?.count).toBe(1)

  const [friendship] = await database.select().from(friendships)
  expect(friendship?.acceptedAt).not.toBeNull()

  const [saved] = await database.select().from(rosters).where(eq(rosters.id, PREVIEW_ROSTER.id))
  expect(saved).toMatchObject({
    name: PREVIEW_ROSTER.name,
    catalogueId: PREVIEW_ROSTER.catalogueId,
    detachmentId: JSON.stringify(PREVIEW_ROSTER.detachmentIds),
    disposition: PREVIEW_ROSTER.disposition,
    limit: 2000,
    picks: JSON.stringify(PREVIEW_ROSTER.picks),
  })

  const [opponentSaved] = await database.select().from(rosters).where(eq(rosters.id, PREVIEW_OPPONENT_ROSTER.id))
  expect(opponentSaved).toMatchObject({
    name: PREVIEW_OPPONENT_ROSTER.name,
    catalogueId: PREVIEW_OPPONENT_ROSTER.catalogueId,
    detachmentId: JSON.stringify(PREVIEW_OPPONENT_ROSTER.detachmentIds),
    disposition: PREVIEW_OPPONENT_ROSTER.disposition,
    limit: 2000,
    picks: JSON.stringify(PREVIEW_OPPONENT_ROSTER.picks),
  })
})

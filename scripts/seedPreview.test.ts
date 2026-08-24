import { count, eq } from 'drizzle-orm'
import { afterEach, expect, it } from 'vitest'
import type { PraetoriumConnection } from '../src/db/connection'
import { openTestDatabase } from '../src/db/testDatabase'
import { Repository } from '../src/db/repository'
import { friendships, rosters, user } from '../src/db/schema'
import { PREVIEW_EMAIL, PREVIEW_OPPONENT_EMAIL, PREVIEW_OPPONENT_ROSTERS, PREVIEW_ROSTERS, seedPreview } from './seedPreview'

let connection: PraetoriumConnection | undefined

afterEach(async () => {
  await connection?.close()
  connection = undefined
})

it('creates two idempotent preview accounts, their eight rosters and their friendship', async () => {
  connection = await openTestDatabase()
  const database = connection.database

  await seedPreview(database)
  await seedPreview(database)

  const [previewAccounts] = await database.select({ count: count() }).from(user).where(eq(user.email, PREVIEW_EMAIL))
  const [opponentAccounts] = await database.select({ count: count() }).from(user).where(eq(user.email, PREVIEW_OPPONENT_EMAIL))
  expect(previewAccounts?.count).toBe(1)
  expect(opponentAccounts?.count).toBe(1)

  const accounts = await new Repository(database).adminUsers()
  expect(accounts.users.find((entry) => entry.email === PREVIEW_EMAIL)).toMatchObject({
    role: 'admin',
    rosterCount: 4,
    signInMethods: ['credential'],
  })

  const [friendship] = await database.select().from(friendships)
  expect(friendship?.acceptedAt).not.toBeNull()

  const saved = await database.select().from(rosters)
  expect(saved).toHaveLength(8)
  for (const roster of [...PREVIEW_ROSTERS, ...PREVIEW_OPPONENT_ROSTERS]) {
    expect(saved.filter((row) => row.id === roster.id)).toEqual([
      expect.objectContaining({
        name: roster.name,
        catalogueId: roster.catalogueId,
        detachmentId: JSON.stringify(roster.detachmentIds),
        disposition: roster.disposition,
        limit: roster.limit,
        picks: JSON.stringify(roster.picks),
      }),
    ])
  }

  // A 2v1 splits its points across the allied pair, so each account needs lists at
  // half the battle size as well as at the whole of it — two apiece, so a second
  // battle can be played with a different army without building one first.
  for (const library of [PREVIEW_ROSTERS, PREVIEW_OPPONENT_ROSTERS]) {
    expect(library.map((roster) => roster.limit).toSorted((left, right) => left - right)).toEqual([1000, 1000, 2000, 2000])
  }
  // Every list is a different faction, so a screen that draws one has more than one to draw.
  const catalogues = [...PREVIEW_ROSTERS, ...PREVIEW_OPPONENT_ROSTERS].map((roster) => roster.catalogueId)
  expect(new Set(catalogues).size).toBe(catalogues.length)
})

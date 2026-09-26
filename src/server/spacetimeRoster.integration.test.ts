import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { SpacetimeOperator } from './spacetimeOperator'

const url = process.env.SPACETIME_TEST_URL
const database = process.env.SPACETIME_TEST_DATABASE
const token = process.env.SPACETIME_TEST_OPERATOR_TOKEN

it.skipIf(!url || !database || !token)('keeps roster writes atomic and owned in SpacetimeDB', async () => {
  const store = new SpacetimeOperator(url!, database!, token!)
  const id = randomUUID()
  const userId = randomUUID()
  const input = {
    id,
    userId,
    name: 'Proof roster',
    catalogueId: 'catalogue-proof',
    detachmentId: null,
    disposition: null,
    limit: 1_000,
    picks: '[]',
    prep: null,
    tags: '[]',
    waivedRules: '[]',
    optionalRules: '[]',
    borrowedDetachmentId: null,
    visibility: 'private' as const,
    source: 'editable' as const,
    now: Date.now(),
  }
  try {
    expect(await store.saveRoster(input)).toBe('inserted')
    expect((await store.roster(id))?.userId).toBe(userId)
    expect(await store.saveRoster({ ...input, userId: 'other', name: 'stolen' })).toBeNull()
    expect((await store.roster(id))?.name).toBe('Proof roster')
    expect(await store.saveRoster({ ...input, name: 'Updated', now: input.now + 1 })).toBe('updated')
    expect(await store.publicRostersByUser(userId, 10)).toEqual([])
    expect(await store.setRosterVisibility(id, 'other', 'public', input.now + 2)).toBe(false)
    expect(await store.setRosterVisibility(id, userId, 'public', input.now + 2)).toBe(true)
    expect((await store.publicRostersByUser(userId, 10)).map((row) => row.id)).toEqual([id])
    await store.deleteRoster(id, 'other')
    expect(await store.roster(id)).toBeTruthy()
  } finally {
    await store.deleteRoster(id, userId)
  }
  expect(await store.roster(id)).toBeUndefined()
})

it.skipIf(!url || !database || !token)('rejects a caller without the operator identity', async () => {
  const outsider = new SpacetimeOperator(url!, database!, 'invalid-operator-token')
  await expect(outsider.roster(randomUUID())).rejects.toThrow(/HTTP (401|403)/)
})

it.skipIf(!url || !database || !token)('keeps collection and favourites idempotent and scoped to one user', async () => {
  const store = new SpacetimeOperator(url!, database!, token!)
  const userId = randomUUID()
  const entryId = randomUUID()
  const catalogueId = randomUUID()
  const detachmentId = randomUUID()
  const now = Date.now()
  try {
    await store.addToCollection({ userId, entryId, now })
    await store.addToCollection({ userId, entryId, now: now + 1 })
    await store.addFavouriteFaction({ userId, catalogueId, now })
    await store.addFavouriteFaction({ userId, catalogueId, now: now + 1 })
    await store.addFavouriteDetachment({ userId, catalogueId, detachmentId, now })
    await store.addFavouriteDetachment({ userId, catalogueId, detachmentId, now: now + 1 })
    expect(await store.collectionByUser(userId)).toEqual([{ userId, entryId, at: now }])
    expect(await store.favouriteFactionsByUser(userId)).toEqual([{ userId, catalogueId, at: now }])
    expect(await store.favouriteDetachmentsByUser(userId)).toEqual([{ userId, catalogueId, detachmentId, at: now }])
    expect(await store.collectionByUser('other')).toEqual([])
  } finally {
    await store.removeFromCollection(userId, entryId)
    await store.removeFavouriteFaction(userId, catalogueId)
    await store.removeFavouriteDetachment(userId, catalogueId, detachmentId)
  }
  expect(await store.collectionByUser(userId)).toEqual([])
})

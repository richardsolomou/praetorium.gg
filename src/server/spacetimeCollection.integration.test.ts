import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { SpacetimeOperator } from './spacetimeOperator'

const url = process.env.SPACETIME_TEST_URL
const database = process.env.SPACETIME_TEST_DATABASE
const token = process.env.SPACETIME_TEST_OPERATOR_TOKEN

it.skipIf(!url || !database || !token)('publishes only opted-in model counts and revokes them on hiding or account deletion', async () => {
  const operator = new SpacetimeOperator(url!, database!, token!)
  const owner = randomUUID()
  const other = randomUUID()
  try {
    expect(await operator.collectionProfile(owner, owner)).toEqual({ published: false, entries: [] })
    await operator.setCollectionModels({ userId: owner, entryId: 'warriors', models: 100, now: Date.now() })
    expect(await operator.collectionProfile(owner, null)).toBeNull()
    expect(await operator.collectionProfile(owner, other)).toBeNull()
    expect(await operator.collectionProfile(owner, owner)).toEqual({ published: false, entries: [{ entryId: 'warriors', models: 100 }] })
    expect(await operator.setCollectionPublished(owner, true)).toBe(true)
    expect(await operator.collectionProfile(owner, null)).toEqual({ published: true, entries: [{ entryId: 'warriors', models: 100 }] })
    await operator.setCollectionModels({ userId: owner, entryId: 'overlord', models: 2, now: Date.now() })
    expect((await operator.collectionProfile(owner, other))?.entries).toEqual(
      expect.arrayContaining([
        { entryId: 'warriors', models: 100 },
        { entryId: 'overlord', models: 2 },
      ]),
    )
    await operator.setCollectionPublished(owner, false)
    expect(await operator.collectionProfile(owner, null)).toBeNull()
    await operator.setCollectionPublished(owner, true)
    await operator.deleteUserData(owner)
    expect(await operator.collectionProfile(owner, null)).toBeNull()
    expect(await operator.collectionProfile(owner, owner)).toEqual({ published: false, entries: [] })
  } finally {
    await operator.deleteUserData(owner)
  }
})

import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { SpacetimeOperator } from './spacetimeOperator'

const url = process.env.SPACETIME_TEST_URL
const database = process.env.SPACETIME_TEST_DATABASE
const token = process.env.SPACETIME_TEST_OPERATOR_TOKEN

it.skipIf(!url || !database || !token)(
  'publishes model counts until the owner hides them and revokes them on account deletion',
  async () => {
    const operator = new SpacetimeOperator(url!, database!, token!)
    const owner = randomUUID()
    const other = randomUUID()
    try {
      await operator.setCollectionModels({ userId: owner, entryId: 'warriors', models: 100, now: Date.now() })
      expect(await operator.collectionProfile(owner, null)).toEqual({ published: true, entries: [{ entryId: 'warriors', models: 100 }] })
      await operator.setCollectionModels({ userId: owner, entryId: 'overlord', models: 2, now: Date.now() })
      expect((await operator.collectionProfile(owner, other))?.entries).toEqual(
        expect.arrayContaining([
          { entryId: 'warriors', models: 100 },
          { entryId: 'overlord', models: 2 },
        ]),
      )
      expect(await operator.setCollectionPublished(owner, false)).toBe(false)
      expect(await operator.collectionProfile(owner, null)).toBeNull()
      expect(await operator.collectionProfile(owner, other)).toBeNull()
      expect((await operator.collectionProfile(owner, owner))?.published).toBe(false)
      await operator.setCollectionPublished(owner, true)
      expect((await operator.collectionProfile(owner, null))?.entries).toHaveLength(2)
      await operator.deleteUserData(owner)
      expect(await operator.collectionProfile(owner, null)).toEqual({ published: true, entries: [] })
    } finally {
      await operator.deleteUserData(owner)
    }
  },
)

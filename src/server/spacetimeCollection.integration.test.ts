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

it.skipIf(!url || !database || !token)('keeps one photo per collection row and leaves every dropped photo for deletion', async () => {
  const operator = new SpacetimeOperator(url!, database!, token!)
  const owner = randomUUID()
  const [first, second, third] = [randomUUID(), randomUUID(), randomUUID()]
  const photos: string[] = [first, second, third]
  try {
    await expect(operator.setCollectionPhoto({ userId: owner, entryId: 'warriors', photoId: first, now: Date.now() })).rejects.toThrow(
      'Add the datasheet',
    )
    await operator.setCollectionModels({ userId: owner, entryId: 'warriors', models: 20, now: Date.now() })
    await operator.setCollectionPhoto({ userId: owner, entryId: 'warriors', photoId: first, now: Date.now() })
    await operator.setCollectionPhoto({ userId: owner, entryId: 'warriors', photoId: second, now: Date.now() })
    expect([
      (await operator.collectionProfile(owner, null))?.entries,
      await operator.collectionPhoto(first, null),
      await operator.collectionPhoto(second, null),
    ]).toEqual([[{ entryId: 'warriors', models: 20, photoId: second }], null, { userId: owner, entryId: 'warriors' }])

    await operator.setCollectionPublished(owner, false)
    expect([await operator.collectionPhoto(second, null), await operator.collectionPhoto(second, owner)]).toEqual([
      null,
      { userId: owner, entryId: 'warriors' },
    ])

    await operator.removeFromCollection(owner, 'warriors')
    expect(await operator.collectionPhotoDeletions(1_000)).toContain(second)
    await operator.setCollectionModels({ userId: owner, entryId: 'overlord', models: 1, now: Date.now() })
    await operator.setCollectionPhoto({ userId: owner, entryId: 'overlord', photoId: third, now: Date.now() })
    await operator.deleteUserData(owner)
    const dropped = await operator.collectionPhotoDeletions(1_000)
    expect(photos.every((photoId) => dropped.includes(photoId))).toBe(true)

    await operator.clearCollectionPhotoDeletions(photos)
    expect((await operator.collectionPhotoDeletions(1_000)).some((photoId) => photos.includes(photoId))).toBe(false)
  } finally {
    await operator.deleteUserData(owner)
  }
})

it.skipIf(!url || !database || !token)(
  'lists a datasheet’s shared photos newest first, with a reader’s own even when hidden, until an administrator removes one',
  async () => {
    const operator = new SpacetimeOperator(url!, database!, token!)
    const entryId = `gallery-${randomUUID()}`
    const [shared, hidden] = [randomUUID(), randomUUID()]
    const [sharedPhoto, hiddenPhoto] = [randomUUID(), randomUUID()]
    try {
      for (const [userId, photoId, at] of [
        [shared, sharedPhoto, 1],
        [hidden, hiddenPhoto, 2],
      ] as const) {
        await operator.setCollectionModels({ userId, entryId, models: 1, now: at })
        await operator.setCollectionPhoto({ userId, entryId, photoId, now: at })
      }
      expect((await operator.datasheetPhotos(entryId, null, 12)).map((row) => row.photoId)).toEqual([hiddenPhoto, sharedPhoto])
      await operator.setCollectionPublished(hidden, false)
      expect([
        (await operator.datasheetPhotos(entryId, null, 12)).map((row) => row.photoId),
        (await operator.datasheetPhotos(entryId, hidden, 12)).map((row) => row.photoId),
      ]).toEqual([[sharedPhoto], [hiddenPhoto, sharedPhoto]])
      await operator.removeCollectionPhotoById(sharedPhoto)
      expect([await operator.datasheetPhotos(entryId, null, 12), await operator.collectionPhotoDeletions(1_000)]).toEqual([
        [],
        expect.arrayContaining([sharedPhoto]),
      ])
    } finally {
      await Promise.all([operator.deleteUserData(shared), operator.deleteUserData(hidden)])
    }
  },
)

it.skipIf(!url || !database || !token)(
  'ranks a datasheet’s photos by likes, counting each reader once and withdrawing a deleted reader’s like',
  async () => {
    const operator = new SpacetimeOperator(url!, database!, token!)
    const entryId = `likes-${randomUUID()}`
    const [older, newer, reader] = [randomUUID(), randomUUID(), randomUUID()]
    const [olderPhoto, newerPhoto] = [randomUUID(), randomUUID()]
    const gallery = async (viewerId: string | null) =>
      (await operator.datasheetPhotos(entryId, viewerId, 12)).map(({ photoId, likes, liked }) => [photoId, likes, liked])
    try {
      for (const [userId, photoId, at] of [
        [older, olderPhoto, 1],
        [newer, newerPhoto, 2],
      ] as const) {
        await operator.setCollectionModels({ userId, entryId, models: 1, now: at })
        await operator.setCollectionPhoto({ userId, entryId, photoId, now: at })
      }
      await expect(operator.setCollectionPhotoLike({ userId: older, photoId: olderPhoto, liked: true, now: 3 })).rejects.toThrow(
        'your own photo',
      )
      await operator.setCollectionPhotoLike({ userId: reader, photoId: olderPhoto, liked: true, now: 3 })
      await operator.setCollectionPhotoLike({ userId: reader, photoId: olderPhoto, liked: true, now: 4 })
      expect(await gallery(reader)).toEqual([
        [olderPhoto, 1, true],
        [newerPhoto, 0, false],
      ])
      await operator.deleteUserData(reader)
      expect(await gallery(null)).toEqual([
        [newerPhoto, 0, false],
        [olderPhoto, 0, false],
      ])
    } finally {
      await Promise.all([operator.deleteUserData(older), operator.deleteUserData(newer), operator.deleteUserData(reader)])
    }
  },
)

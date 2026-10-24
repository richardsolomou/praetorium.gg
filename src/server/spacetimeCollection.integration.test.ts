import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { MAX_DATASHEET_PHOTOS } from '../core/collectionPhotos'
import { SpacetimeOperator } from './spacetimeOperator'

const url = process.env.SPACETIME_TEST_URL
const database = process.env.SPACETIME_TEST_DATABASE
const token = process.env.SPACETIME_TEST_OPERATOR_TOKEN

it.skipIf(!url || !database || !token)('publishes model counts and revokes them on account deletion', async () => {
  const operator = new SpacetimeOperator(url!, database!, token!)
  const owner = randomUUID()
  const other = randomUUID()
  try {
    await operator.setCollectionModels({ userId: owner, entryId: 'warriors', models: 100, now: Date.now() })
    expect((await operator.collectionProfile(owner, null))?.entries).toEqual([{ entryId: 'warriors', models: 100 }])
    await operator.setCollectionModels({ userId: owner, entryId: 'overlord', models: 2, now: Date.now() })
    expect((await operator.collectionProfile(owner, other))?.entries).toEqual(
      expect.arrayContaining([
        { entryId: 'warriors', models: 100 },
        { entryId: 'overlord', models: 2 },
      ]),
    )
    await operator.deleteUserData(owner)
    expect((await operator.collectionProfile(owner, null))?.entries).toEqual([])
  } finally {
    await operator.deleteUserData(owner)
  }
})

it.skipIf(!url || !database || !token)(
  'keeps several photos per collection row, in order and up to the limit, and leaves every dropped photo for deletion',
  async () => {
    const operator = new SpacetimeOperator(url!, database!, token!)
    const [owner, other] = [randomUUID(), randomUUID()]
    const photos: string[] = Array.from({ length: MAX_DATASHEET_PHOTOS + 1 }, () => randomUUID())
    const [first, second] = photos as [string, string, ...string[]]
    try {
      for (const [index, photoId] of photos.slice(0, MAX_DATASHEET_PHOTOS).entries())
        await operator.setCollectionPhoto({ userId: owner, entryId: 'warriors', photoId, now: index + 1 })
      expect((await operator.collectionProfile(owner, null))?.entries).toEqual([
        { entryId: 'warriors', models: 1, photoIds: photos.slice(0, MAX_DATASHEET_PHOTOS) },
      ])
      await expect(
        operator.setCollectionPhoto({ userId: owner, entryId: 'warriors', photoId: photos.at(-1)!, now: Date.now() }),
      ).rejects.toThrow(`up to ${MAX_DATASHEET_PHOTOS} photos`)

      await operator.removeCollectionPhoto(other, first)
      await operator.removeCollectionPhoto(owner, second)
      expect([await operator.collectionPhoto(first, null), await operator.collectionPhoto(second, null)]).toEqual([
        { userId: owner, entryId: 'warriors' },
        null,
      ])
      expect(await operator.collectionPhotoDeletions(1_000)).toContain(second)

      await operator.removeFromCollection(owner, 'warriors')
      await operator.setCollectionPhoto({ userId: owner, entryId: 'overlord', photoId: photos.at(-1)!, now: Date.now() })
      await operator.deleteUserData(owner)
      const dropped = await operator.collectionPhotoDeletions(1_000)
      expect(photos.every((photoId) => dropped.includes(photoId))).toBe(true)

      await operator.clearCollectionPhotoDeletions(photos)
      expect((await operator.collectionPhotoDeletions(1_000)).some((photoId) => photos.includes(photoId))).toBe(false)
    } finally {
      await operator.deleteUserData(owner)
    }
  },
)

it.skipIf(!url || !database || !token)('lists a datasheet’s photos newest first until an administrator removes one', async () => {
  const operator = new SpacetimeOperator(url!, database!, token!)
  const entryId = `gallery-${randomUUID()}`
  const [shared, other] = [randomUUID(), randomUUID()]
  const [sharedPhoto, otherPhoto] = [randomUUID(), randomUUID()]
  try {
    for (const [userId, photoId, at] of [
      [shared, sharedPhoto, 1],
      [other, otherPhoto, 2],
    ] as const) {
      await operator.setCollectionModels({ userId, entryId, models: 1, now: at })
      await operator.setCollectionPhoto({ userId, entryId, photoId, now: at })
    }
    expect((await operator.datasheetPhotos(entryId, null, 12)).map((row) => row.photoId)).toEqual([otherPhoto, sharedPhoto])
    await operator.removeCollectionPhotoById(sharedPhoto)
    expect([
      (await operator.datasheetPhotos(entryId, null, 12)).map((row) => row.photoId),
      await operator.collectionPhotoDeletions(1_000),
    ]).toEqual([[otherPhoto], expect.arrayContaining([sharedPhoto])])
  } finally {
    await Promise.all([operator.deleteUserData(shared), operator.deleteUserData(other)])
  }
})

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

it.skipIf(!url || !database || !token)(
  'holds a reported photo from everyone but its owner and administrators until one keeps it, then only flags it',
  async () => {
    const operator = new SpacetimeOperator(url!, database!, token!)
    const entryId = `held-${randomUUID()}`
    const [owner, reader] = [randomUUID(), randomUUID()]
    const photoId = randomUUID()
    const shown = async (viewerId: string | null) => (await operator.datasheetPhotos(entryId, viewerId, 12)).map((row) => row.photoId)
    const held = async () => (await operator.heldCollectionPhotos(1_000)).find((row) => row.photoId === photoId)?.shown ?? null
    try {
      await operator.setCollectionModels({ userId: owner, entryId, models: 1, now: 1 })
      await operator.setCollectionPhoto({ userId: owner, entryId, photoId, now: 1 })
      await expect(operator.reportCollectionPhoto({ userId: owner, photoId })).rejects.toThrow('your own photo')
      await operator.reportCollectionPhoto({ userId: reader, photoId })
      expect([await shown(null), await shown(reader), await shown(owner), await operator.collectionPhoto(photoId, reader)]).toEqual([
        [],
        [],
        [photoId],
        null,
      ])
      expect([await held(), await operator.collectionPhotoForAdmin(photoId)]).toEqual([false, { userId: owner, entryId }])
      expect([
        (await operator.collectionProfile(owner, reader))?.entries,
        (await operator.collectionProfile(owner, owner))?.entries,
      ]).toEqual([[{ entryId, models: 1 }], [{ entryId, models: 1, photoIds: [photoId] }]])
      await expect(operator.setCollectionPhotoLike({ userId: reader, photoId, liked: true, now: 2 })).rejects.toThrow('no longer shown')
      await operator.keepCollectionPhoto(photoId)
      expect([await shown(null), await held()]).toEqual([[photoId], null])
      await operator.reportCollectionPhoto({ userId: randomUUID(), photoId })
      expect([await shown(null), await held()]).toEqual([[photoId], true])
      await operator.keepCollectionPhoto(photoId)
      expect(await held()).toBeNull()
    } finally {
      await Promise.all([operator.deleteUserData(owner), operator.deleteUserData(reader)])
    }
  },
)

it.skipIf(!url || !database || !token)('pages the newest photos for administrators, leaving out those awaiting review', async () => {
  const operator = new SpacetimeOperator(url!, database!, token!)
  const entryId = `recent-${randomUUID()}`
  const [owner, other, reader] = [randomUUID(), randomUUID(), randomUUID()]
  const [older, newer, reported, flagged, others] = [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()]
  const now = Date.now()
  try {
    await operator.setCollectionModels({ userId: owner, entryId, models: 4, now })
    await operator.setCollectionModels({ userId: other, entryId, models: 1, now })
    await operator.setCollectionPhoto({ userId: owner, entryId, photoId: older, now })
    await operator.setCollectionPhoto({ userId: owner, entryId, photoId: newer, now: now + 1 })
    await operator.setCollectionPhoto({ userId: owner, entryId, photoId: reported, now: now + 2 })
    await operator.setCollectionPhoto({ userId: owner, entryId, photoId: flagged, now: now + 3 })
    await operator.setCollectionPhoto({ userId: other, entryId, photoId: others, now: now + 4 })
    await operator.reportCollectionPhoto({ userId: reader, photoId: reported })
    await operator.keepCollectionPhoto(flagged)
    await operator.reportCollectionPhoto({ userId: reader, photoId: flagged })
    const everyone = await operator.adminCollectionPhotos({ before: null, limit: 100 })
    expect(everyone.photos.filter((row) => row.entryId === entryId).map((row) => row.photoId)).toEqual([others, newer, older])
    const after = await operator.adminCollectionPhotos({ before: { at: now + 4, id: others }, limit: 100 })
    expect(after.photos.filter((row) => row.entryId === entryId).map((row) => row.photoId)).toEqual([newer, older])
  } finally {
    await Promise.all([operator.deleteUserData(owner), operator.deleteUserData(other), operator.deleteUserData(reader)])
  }
})

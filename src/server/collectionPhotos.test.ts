import { describe, expect, it, vi } from 'vitest'
import { collectionPhotoReportEmail, collectionPhotoStore } from './collectionPhotos'
import type { PrivateObjects } from './privateImages'

const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')])
const image = `data:image/webp;base64,${WEBP.toString('base64')}`
const conditional = (photoId: string, etag = `"${photoId}"`) =>
  new Request(`https://praetorium.gg/api/collection-photos/${photoId}`, { headers: { 'If-None-Match': etag } })

function memoryObjects() {
  const stored = new Map<string, Uint8Array>()
  const objects: PrivateObjects = {
    put: async (key, body) => void stored.set(key, body),
    get: async (key) => stored.get(key) ?? null,
    delete: async (key) => void stored.delete(key),
  }
  return { stored, objects }
}

function fakeRepository({ refuse = false } = {}) {
  const photos = new Map<string, { userId: string; entryId: string; published: boolean; held?: boolean }>()
  const deletions: string[] = []
  return {
    photos,
    deletions,
    setCollectionPhoto: async ({ userId, entryId, photoId }: { userId: string; entryId: string; photoId: string }) => {
      if (refuse) throw new Error('refused')
      photos.set(photoId, { userId, entryId, published: true })
    },
    removeCollectionPhoto: async () => undefined,
    removeCollectionPhotoById: async () => undefined,
    setCollectionPhotoLike: async () => undefined,
    datasheetPhotos: async (entryId: string) =>
      [...photos]
        .filter(([, photo]) => photo.entryId === entryId)
        .map(([photoId, photo]) => ({ photoId, userId: photo.userId, at: 1, likes: 0, liked: false })),
    namesByIds: async (ids: readonly string[]) =>
      new Map(ids.filter((id) => id !== 'deleted').map((id) => [id, { id, name: `Player ${id}` }] as const)),
    collectionPhoto: async (photoId: string, viewerId: string | null) => {
      const photo = photos.get(photoId)
      return photo && ((photo.published && !photo.held) || photo.userId === viewerId)
        ? { userId: photo.userId, entryId: photo.entryId }
        : null
    },
    collectionPhotoForAdmin: async (photoId: string) => {
      const photo = photos.get(photoId)
      return photo ? { userId: photo.userId, entryId: photo.entryId } : null
    },
    reportCollectionPhoto: async ({ photoId }: { photoId: string }) => void (photos.get(photoId)!.held = true),
    keepCollectionPhoto: async (photoId: string) => void (photos.get(photoId)!.held = false),
    heldCollectionPhotos: async () =>
      [...photos]
        .filter(([, photo]) => photo.held)
        .map(([photoId, { userId, entryId }]) => ({ photoId, userId, entryId, at: 1, shown: false })),
    recentCollectionPhotos: async () =>
      [...photos].filter(([, photo]) => !photo.held).map(([photoId, { userId, entryId }]) => ({ photoId, userId, entryId, at: 1 })),
    collectionPhotoDeletions: async (limit: number) => deletions.slice(0, limit),
    clearCollectionPhotoDeletions: async (photoIds: readonly string[]) => {
      for (const photoId of photoIds) deletions.splice(deletions.indexOf(photoId), 1)
    },
  }
}

describe('collectionPhotoStore', () => {
  it('stores an uploaded photo privately and records it on the collection row', async () => {
    const { stored, objects } = memoryObjects()
    const repository = fakeRepository()
    const photoId = await collectionPhotoStore(repository, () => objects).upload('owner', 'warriors', image)
    expect([[...stored.keys()], repository.photos.get(photoId)?.entryId]).toEqual([[`collection-photos/${photoId}`], 'warriors'])
  })

  it('deletes the stored object when the collection refuses the photo', async () => {
    const { stored, objects } = memoryObjects()
    await expect(collectionPhotoStore(fakeRepository({ refuse: true }), () => objects).upload('owner', 'warriors', image)).rejects.toThrow(
      'refused',
    )
    expect(stored.size).toBe(0)
  })

  it('lets browsers store a photo but requires access revalidation before reuse', async () => {
    const { objects } = memoryObjects()
    const store = collectionPhotoStore(fakeRepository(), () => objects)
    const photoId = await store.upload('owner', 'warriors', image)
    const response = await store.response(photoId, null)
    expect([
      response.status,
      response.headers.get('content-type'),
      response.headers.get('cache-control'),
      response.headers.get('etag'),
    ]).toEqual([200, 'image/webp', 'private, no-cache', `"${photoId}"`])
  })

  it('revalidates a cached photo without reading or sending its stored bytes again', async () => {
    const { objects } = memoryObjects()
    const store = collectionPhotoStore(fakeRepository(), () => objects)
    const photoId = await store.upload('owner', 'warriors', image)
    await store.response(photoId, null)
    vi.spyOn(objects, 'get').mockRejectedValue(new Error('read cached image'))
    const response = await store.response(photoId, null, false, conditional(photoId))
    expect([response.status, response.headers.get('cache-control'), response.headers.get('etag'), await response.text()]).toEqual([
      304,
      'private, no-cache',
      `"${photoId}"`,
      '',
    ])
  })

  it('sends the image when the cached validator differs', async () => {
    const { objects } = memoryObjects()
    const store = collectionPhotoStore(fakeRepository(), () => objects)
    const photoId = await store.upload('owner', 'warriors', image)
    const response = await store.response(photoId, null, false, conditional(photoId, '"other"'))
    expect([response.status, Buffer.from(await response.arrayBuffer())]).toEqual([200, WEBP])
  })

  it.each(['private', 'held', 'removed'] as const)('refuses a cached photo after it becomes %s', async (state) => {
    const { objects } = memoryObjects()
    const repository = fakeRepository()
    const store = collectionPhotoStore(repository, () => objects)
    const photoId = await store.upload('owner', 'warriors', image)
    await store.response(photoId, 'reader')
    if (state === 'private') repository.photos.get(photoId)!.published = false
    if (state === 'held') await store.report('reader', photoId)
    if (state === 'removed') repository.photos.delete(photoId)
    const response = await store.response(photoId, 'reader', false, conditional(photoId))
    expect([response.status, response.headers.get('cache-control'), response.headers.get('etag')]).toEqual([404, 'no-store', null])
  })

  it('checks the current viewer before revalidating a private photo cached by its owner', async () => {
    const { objects } = memoryObjects()
    const repository = fakeRepository()
    const store = collectionPhotoStore(repository, () => objects)
    const photoId = await store.upload('owner', 'warriors', image)
    repository.photos.get(photoId)!.published = false
    await store.response(photoId, 'owner')
    expect((await store.response(photoId, null, false, conditional(photoId))).status).toBe(404)
  })

  it('keeps a missing object response uncacheable', async () => {
    const { objects, stored } = memoryObjects()
    const store = collectionPhotoStore(fakeRepository(), () => objects)
    const photoId = await store.upload('owner', 'warriors', image)
    stored.clear()
    const response = await store.response(photoId, 'owner')
    expect([response.status, response.headers.get('cache-control'), response.headers.get('etag')]).toEqual([404, 'no-store', null])
  })

  it('hides a photo from other readers once its owner stops sharing', async () => {
    const { objects } = memoryObjects()
    const repository = fakeRepository()
    const store = collectionPhotoStore(repository, () => objects)
    const photoId = await store.upload('owner', 'warriors', image)
    repository.photos.get(photoId)!.published = false
    expect([(await store.response(photoId, 'reader')).status, (await store.response(photoId, 'owner')).status]).toEqual([404, 200])
  })

  it('shows a photo a report holds to administrators only', async () => {
    const { objects } = memoryObjects()
    const store = collectionPhotoStore(fakeRepository(), () => objects)
    const photoId = await store.upload('owner', 'warriors', image)
    await store.report('reader', photoId)
    expect([(await store.response(photoId, 'reader')).status, (await store.response(photoId, 'admin', true)).status]).toEqual([404, 200])
  })

  it('lists held photos named for their owners, keeping a deleted owner’s photo reviewable', async () => {
    const { objects } = memoryObjects()
    const store = collectionPhotoStore(fakeRepository(), () => objects)
    const photoId = await store.upload('deleted', 'warriors', image)
    await store.report('reader', photoId)
    expect((await store.held()).map(({ owner }) => owner.name)).toEqual(['Deleted player'])
  })

  it('lists recent photos named for their owners', async () => {
    const { objects } = memoryObjects()
    const store = collectionPhotoStore(fakeRepository(), () => objects)
    await store.upload('owner', 'warriors', image)
    expect((await store.recent()).map(({ owner }) => owner.name)).toEqual(['Player owner'])
  })

  it('answers a malformed photo id as not found without asking the collection', async () => {
    const repository = { ...fakeRepository(), collectionPhoto: () => Promise.reject(new Error('asked')) }
    expect((await collectionPhotoStore(repository, () => memoryObjects().objects).response('../feedback/x', null)).status).toBe(404)
  })

  it('deletes the objects of dropped photos and clears their records', async () => {
    const { stored, objects } = memoryObjects()
    const repository = fakeRepository()
    const store = collectionPhotoStore(repository, () => objects)
    const photoId = await store.upload('owner', 'warriors', image)
    repository.deletions.push(photoId)
    expect([await store.drainDeletions(), stored.size, repository.deletions]).toEqual([1, 0, []])
  })

  it('names each gallery photo for its owner and leaves out a photo whose owner has no account', async () => {
    const { objects } = memoryObjects()
    const store = collectionPhotoStore(fakeRepository(), () => objects)
    const kept = await store.upload('owner', 'warriors', image)
    await store.upload('deleted', 'warriors', image)
    expect((await store.gallery('warriors', null)).map(({ photoId, owner }) => [photoId, owner.name])).toEqual([[kept, 'Player owner']])
  })
})

it('reports a photo to administrators with links to it and its owner', () => {
  const email = collectionPhotoReportEmail(
    { photoId: '0b7c6d1e-3f2a-4c5b-8d9e-0a1b2c3d4e5f', ownerId: 'owner', reason: 'Not a model' },
    { name: 'Reader', email: 'reader@example.com' },
    'https://praetorium.gg',
  )
  expect(email.text.split('\n').slice(0, 5)).toEqual([
    'Reported by: Reader <reader@example.com>',
    'Photo: https://praetorium.gg/api/collection-photos/0b7c6d1e-3f2a-4c5b-8d9e-0a1b2c3d4e5f',
    'Owner: https://praetorium.gg/users/owner?tab=collection',
    '',
    'Not a model',
  ])
})

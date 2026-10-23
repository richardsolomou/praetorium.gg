import { describe, expect, it, vi } from 'vitest'
import { collectionPhotoReportEmail, collectionPhotoStore } from './collectionPhotos'
import type { PrivateObjects } from './privateImages'
import sharp from 'sharp'
import { randomUUID } from 'node:crypto'

const WEBP = await sharp({ create: { width: 960, height: 1280, channels: 3, background: '#596943' } })
  .webp()
  .toBuffer()
const image = `data:image/webp;base64,${WEBP.toString('base64')}`
const conditional = (photoId: string, etag = `"${photoId}"`) =>
  new Request(`https://praetorium.gg/api/collection-photos/${photoId}`, { headers: { 'If-None-Match': etag } })

function memoryObjects() {
  const stored = new Map<string, Uint8Array>()
  const objects: PrivateObjects = {
    head: async (key) => stored.has(key),
    put: async (key, body) => void stored.set(key, body),
    get: async (key) => stored.get(key) ?? null,
    delete: async (key) => void stored.delete(key),
  }
  return { stored, objects }
}

function fakeRepository({ refuse = false } = {}) {
  const photos = new Map<string, { userId: string; entryId: string; held?: boolean }>()
  const deletions: string[] = []
  return {
    photos,
    deletions,
    setCollectionPhoto: async ({ userId, entryId, photoId }: { userId: string; entryId: string; photoId: string }) => {
      if (refuse) throw new Error('refused')
      photos.set(photoId, { userId, entryId })
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
      return photo && (!photo.held || photo.userId === viewerId) ? { userId: photo.userId, entryId: photo.entryId } : null
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
    adminCollectionPhotos: async () => ({
      photos: [...photos]
        .filter(([, photo]) => !photo.held)
        .map(([photoId, { userId, entryId }]) => ({ photoId, userId, entryId, at: 1, likes: 0, kept: false })),
      nextCursor: null,
    }),
    collectionPhotoDeletions: async (limit: number) => deletions.slice(0, limit),
    clearCollectionPhotoDeletions: async (photoIds: readonly string[]) => {
      for (const photoId of photoIds) deletions.splice(deletions.indexOf(photoId), 1)
    },
    collectionPhotoIds: async (after: string | null, limit: number) =>
      [...photos.keys()]
        .filter((id) => after === null || id > after)
        .sort()
        .slice(0, limit),
    queueCollectionPhotoDeletion: async (photoId: string) => {
      if (!photos.has(photoId) && !deletions.includes(photoId)) deletions.push(photoId)
    },
  }
}

describe('collectionPhotoStore', () => {
  it('stores an uploaded photo privately and records it on the collection row', async () => {
    const { stored, objects } = memoryObjects()
    const repository = fakeRepository()
    const photoId = await collectionPhotoStore(repository, () => objects).upload('owner', 'warriors', image)
    expect([[...stored.keys()], repository.photos.get(photoId)?.entryId]).toEqual([
      [`collection-photos/${photoId}`, `collection-photos/${photoId}.thumbnail.webp`],
      'warriors',
    ])
  })

  it('stores a smaller WebP thumbnail with the original aspect ratio', async () => {
    const { stored, objects } = memoryObjects()
    const photoId = await collectionPhotoStore(fakeRepository(), () => objects).upload('owner', 'warriors', image)
    const thumbnail = stored.get(`collection-photos/${photoId}.thumbnail.webp`)!
    const metadata = await sharp(thumbnail).metadata()
    expect([metadata.format, metadata.width, metadata.height, thumbnail.length < WEBP.length]).toEqual(['webp', 240, 320, true])
  })

  it('rolls back both objects when storing the thumbnail fails', async () => {
    const { stored, objects } = memoryObjects()
    const put = objects.put
    objects.put = async (...args) => {
      if (args[0].endsWith('.thumbnail.webp')) throw new Error('thumbnail write failed')
      await put(...args)
    }
    await expect(collectionPhotoStore(fakeRepository(), () => objects).upload('owner', 'warriors', image)).rejects.toThrow(
      'thumbnail write failed',
    )
    expect(stored.size).toBe(0)
  })

  it('queues cleanup when an upload is refused and object deletion fails', async () => {
    const { stored, objects } = memoryObjects()
    const repository = fakeRepository({ refuse: true })
    const store = collectionPhotoStore(repository, () => objects)
    const remove = objects.delete
    objects.delete = async () => {
      throw new Error('storage unavailable')
    }
    await expect(store.upload('owner', 'warriors', image)).rejects.toThrow('Photo upload and cleanup failed')
    expect(repository.deletions).toHaveLength(1)
    objects.delete = remove
    await store.drainDeletions()
    expect(stored.size).toBe(0)
  })

  it('serves thumbnail bytes with a distinct validator', async () => {
    const { stored, objects } = memoryObjects()
    const store = collectionPhotoStore(fakeRepository(), () => objects)
    const photoId = await store.upload('owner', 'warriors', image)
    const request = new Request(`https://praetorium.gg/api/collection-photos/${photoId}?size=thumbnail`)
    const response = await store.response(photoId, null, false, request)
    expect([response.headers.get('etag'), Buffer.from(await response.arrayBuffer())]).toEqual([
      `"${photoId}-thumbnail-v1"`,
      Buffer.from(stored.get(`collection-photos/${photoId}.thumbnail.webp`)!),
    ])
  })

  it('backfills existing originals and skips completed thumbnails on a second pass', async () => {
    const { stored, objects } = memoryObjects()
    const repository = fakeRepository()
    const photoId = randomUUID()
    repository.photos.set(photoId, { userId: 'owner', entryId: 'warriors', held: true })
    stored.set(`collection-photos/${photoId}`, WEBP)
    const store = collectionPhotoStore(repository, () => objects)
    await store.backfillThumbnails()
    const put = vi.spyOn(objects, 'put')
    expect([stored.has(`collection-photos/${photoId}.thumbnail.webp`), await store.backfillThumbnails(), put.mock.calls.length]).toEqual([
      true,
      { generated: 0, failed: 0 },
      0,
    ])
  })

  it('never rewrites the original while it backfills a thumbnail', async () => {
    const { stored, objects } = memoryObjects()
    const repository = fakeRepository()
    const photoId = randomUUID()
    repository.photos.set(photoId, { userId: 'owner', entryId: 'warriors' })
    stored.set(`collection-photos/${photoId}`, WEBP)
    const put = vi.spyOn(objects, 'put')
    await collectionPhotoStore(repository, () => objects).backfillThumbnails()
    expect(put.mock.calls.map(([key]) => key)).toEqual([`collection-photos/${photoId}.thumbnail.webp`])
  })

  it('removes a backfilled thumbnail when the photo was deleted during its write', async () => {
    const { stored, objects } = memoryObjects()
    const repository = fakeRepository()
    const photoId = randomUUID()
    repository.photos.set(photoId, { userId: 'owner', entryId: 'warriors' })
    stored.set(`collection-photos/${photoId}`, WEBP)
    const put = objects.put
    objects.put = async (...args) => {
      await put(...args)
      repository.photos.delete(photoId)
      stored.delete(`collection-photos/${photoId}`)
    }
    await collectionPhotoStore(repository, () => objects).backfillThumbnails()
    expect(stored.size).toBe(0)
  })

  it('queues a racing deletion when thumbnail cleanup fails after the original was removed', async () => {
    const { stored, objects } = memoryObjects()
    const repository = fakeRepository()
    const photoId = randomUUID()
    repository.photos.set(photoId, { userId: 'owner', entryId: 'warriors' })
    stored.set(`collection-photos/${photoId}`, WEBP)
    const put = objects.put
    const remove = objects.delete
    objects.put = async (...args) => {
      await put(...args)
      repository.photos.delete(photoId)
      stored.delete(`collection-photos/${photoId}`)
    }
    objects.delete = async () => {
      throw new Error('storage unavailable')
    }
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const store = collectionPhotoStore(repository, () => objects)
      await store.backfillThumbnails()
      expect(repository.deletions).toEqual([photoId])
      objects.delete = remove
      await store.drainDeletions()
      expect(stored.size).toBe(0)
    } finally {
      log.mockRestore()
    }
  })

  it('generates a missing thumbnail on its first authorized read', async () => {
    const { stored, objects } = memoryObjects()
    const repository = fakeRepository()
    const store = collectionPhotoStore(repository, () => objects)
    const photoId = await store.upload('owner', 'warriors', image)
    stored.delete(`collection-photos/${photoId}.thumbnail.webp`)
    const response = await store.response(
      photoId,
      null,
      false,
      new Request(`https://praetorium.gg/api/collection-photos/${photoId}?size=thumbnail`),
    )
    expect([response.status, stored.has(`collection-photos/${photoId}.thumbnail.webp`)]).toEqual([200, true])
  })

  it('revalidates a cached thumbnail without reading stored bytes', async () => {
    const { objects } = memoryObjects()
    const store = collectionPhotoStore(fakeRepository(), () => objects)
    const photoId = await store.upload('owner', 'warriors', image)
    vi.spyOn(objects, 'get').mockRejectedValue(new Error('read cached thumbnail'))
    const response = await store.response(
      photoId,
      null,
      false,
      new Request(`https://praetorium.gg/api/collection-photos/${photoId}?size=thumbnail`, {
        headers: { 'If-None-Match': `"${photoId}-thumbnail-v1"` },
      }),
    )
    expect([response.status, await response.text()]).toEqual([304, ''])
  })

  it.each(['held', 'removed'] as const)('revokes a cached thumbnail when the photo becomes %s', async (state) => {
    const { objects } = memoryObjects()
    const repository = fakeRepository()
    const store = collectionPhotoStore(repository, () => objects)
    const photoId = await store.upload('owner', 'warriors', image)
    if (state === 'held') repository.photos.get(photoId)!.held = true
    if (state === 'removed') repository.photos.delete(photoId)
    const response = await store.response(
      photoId,
      null,
      false,
      new Request(`https://praetorium.gg/api/collection-photos/${photoId}?size=thumbnail`, {
        headers: { 'If-None-Match': `"${photoId}-thumbnail-v1"` },
      }),
    )
    expect([response.status, response.headers.get('cache-control')]).toEqual([404, 'no-store'])
  })

  it('keeps deletion records until both objects have been removed', async () => {
    const { stored, objects } = memoryObjects()
    const repository = fakeRepository()
    const store = collectionPhotoStore(repository, () => objects)
    const photoId = await store.upload('owner', 'warriors', image)
    repository.deletions.push(photoId)
    const remove = objects.delete
    objects.delete = async (key) => {
      if (key.endsWith('.thumbnail.webp')) throw new Error('storage unavailable')
      await remove(key)
    }
    await expect(store.drainDeletions()).rejects.toThrow('storage unavailable')
    expect(repository.deletions).toEqual([photoId])
    objects.delete = remove
    await store.drainDeletions()
    expect([stored.size, repository.deletions]).toEqual([0, []])
  })

  it('finishes later migration pages after an earlier thumbnail fails and retries it on rerun', async () => {
    const { stored, objects } = memoryObjects()
    const repository = fakeRepository()
    const ids = [randomUUID(), randomUUID(), randomUUID()].sort()
    for (const id of ids) {
      repository.photos.set(id, { userId: 'owner', entryId: 'warriors' })
      stored.set(`collection-photos/${id}`, WEBP)
    }
    repository.collectionPhotoIds = async (after) => ids.filter((id) => after === null || id > after).slice(0, 1)
    const put = objects.put
    objects.put = async (...args) => {
      if (args[0].includes(ids[0]!)) throw new Error('storage unavailable')
      await put(...args)
    }
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const store = collectionPhotoStore(repository, () => objects)
      expect(await store.backfillThumbnails()).toEqual({ generated: 2, failed: 1 })
      objects.put = put
      expect(await store.backfillThumbnails()).toEqual({ generated: 1, failed: 0 })
    } finally {
      log.mockRestore()
    }
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

  it.each(['held', 'removed'] as const)('refuses a cached photo after it becomes %s', async (state) => {
    const { objects } = memoryObjects()
    const repository = fakeRepository()
    const store = collectionPhotoStore(repository, () => objects)
    const photoId = await store.upload('owner', 'warriors', image)
    await store.response(photoId, 'reader')
    if (state === 'held') await store.report('reader', photoId)
    if (state === 'removed') repository.photos.delete(photoId)
    const response = await store.response(photoId, 'reader', false, conditional(photoId))
    expect([response.status, response.headers.get('cache-control'), response.headers.get('etag')]).toEqual([404, 'no-store', null])
  })

  it('checks the current viewer before revalidating a held photo cached by its owner', async () => {
    const { objects } = memoryObjects()
    const repository = fakeRepository()
    const store = collectionPhotoStore(repository, () => objects)
    const photoId = await store.upload('owner', 'warriors', image)
    repository.photos.get(photoId)!.held = true
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

  it('lists a page of photos named for their owners', async () => {
    const { objects } = memoryObjects()
    const store = collectionPhotoStore(fakeRepository(), () => objects)
    await store.upload('owner', 'warriors', image)
    expect((await store.browse(null)).photos.map(({ owner }) => owner.name)).toEqual(['Player owner'])
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

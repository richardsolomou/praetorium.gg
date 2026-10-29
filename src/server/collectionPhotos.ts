import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { type AdminCollectionPhotosCursor, COLLECTION_PHOTO_MAX_BYTES, collectionPhotoPath } from '../contracts/collection'
import { ifNoneMatch } from './ifNoneMatch'
import { notFound } from './notFound'
import { parseImageDataUrl, privateImageResponse, type PrivateObjects } from './privateImages'
import { collectionPhotoThumbnail, collectionPhotoThumbnailKey } from './collectionPhotoThumbnail'
import type { SpacetimeRepository } from './spacetimeRepository'
import { reportServerFailure } from '../adapters/posthog'

const PREFIX = 'collection-photos/'
const DELETION_BATCH = 100
const DELETION_BATCHES_PER_DRAIN = 20
const DATASHEET_GALLERY_SIZE = 12
const HELD_LIST_SIZE = 100
const ADMIN_PAGE_SIZE = 24

type PhotoRepository = Pick<
  SpacetimeRepository,
  | 'setCollectionPhoto'
  | 'removeCollectionPhoto'
  | 'removeCollectionPhotoById'
  | 'collectionPhotoForAdmin'
  | 'reportCollectionPhoto'
  | 'keepCollectionPhoto'
  | 'heldCollectionPhotos'
  | 'adminCollectionPhotos'
  | 'setCollectionPhotoLike'
  | 'collectionPhoto'
  | 'datasheetPhotos'
  | 'collectionPhotoDeletions'
  | 'collectionPhotoIds'
  | 'clearCollectionPhotoDeletions'
  | 'queueCollectionPhotoDeletion'
  | 'namesByIds'
>

/**
 * Collection photos live in the private bucket and are served through the app, so revoking one takes effect on the next read.
 * The product module records every dropped photo in the same transaction as its row; `drainDeletions` removes those objects.
 */
export function collectionPhotoStore(
  repository: PhotoRepository,
  privateObjects: () => PrivateObjects | null,
  clock: () => number = Date.now,
) {
  async function deleteObjects(objects: PrivateObjects, photoId: string) {
    await Promise.all([objects.delete(`${PREFIX}${photoId}`), objects.delete(collectionPhotoThumbnailKey(photoId))])
  }

  async function generateThumbnail(objects: PrivateObjects, photoId: string) {
    const original = await objects.get(`${PREFIX}${photoId}`)
    if (!original) {
      if (await repository.collectionPhotoForAdmin(photoId)) throw new Error('Photo original is missing')
      return null
    }
    const thumbnail = await collectionPhotoThumbnail(original)
    const key = collectionPhotoThumbnailKey(photoId)
    try {
      await objects.put(key, thumbnail, 'image/webp')
      // A deletion sweep can finish while the original is being resized.
      if (await repository.collectionPhotoForAdmin(photoId)) return thumbnail
      await objects.delete(key)
      return null
    } catch (error) {
      try {
        await objects.delete(key)
      } catch (cleanupError) {
        await repository.queueCollectionPhotoDeletion(photoId)
        throw new AggregateError([error, cleanupError], 'Thumbnail generation and cleanup failed', { cause: cleanupError })
      }
      throw error
    }
  }

  /** Names each photo's owner, keeping a deleted owner's photo reviewable. */
  async function withOwners<Row extends { userId: string }>(rows: Row[]) {
    const owners = await repository.namesByIds(rows.map((row) => row.userId))
    return rows.map(({ userId, ...photo }) => ({ ...photo, owner: owners.get(userId) ?? { id: userId, name: 'Deleted player' } }))
  }

  return {
    async upload(userId: string, entryId: string, image: string, shows?: string) {
      const objects = privateObjects()
      if (!objects) throw new Response('image uploads are not available', { status: 503 })
      const parsed = parseImageDataUrl(image)
      if (!parsed || parsed.bytes.length > COLLECTION_PHOTO_MAX_BYTES)
        throw new Response('Choose a JPEG, PNG or WebP photo.', { status: 400 })
      const thumbnail = await collectionPhotoThumbnail(parsed.bytes).catch(() => {
        throw new Response('That photo could not be read.', { status: 400 })
      })
      const photoId = randomUUID()
      try {
        await objects.put(`${PREFIX}${photoId}`, parsed.bytes, parsed.contentType)
        await objects.put(collectionPhotoThumbnailKey(photoId), thumbnail, 'image/webp')
        await repository.setCollectionPhoto({ userId, entryId, shows, photoId, now: clock() })
      } catch (error) {
        try {
          await deleteObjects(objects, photoId)
        } catch (cleanupError) {
          await repository.queueCollectionPhotoDeletion(photoId)
          throw new AggregateError([error, cleanupError], 'Photo upload and cleanup failed', { cause: cleanupError })
        }
        throw error
      }
      return photoId
    },

    remove(userId: string, photoId: string) {
      return repository.removeCollectionPhoto(userId, photoId)
    },

    /** A datasheet's gallery, named for each photo's owner; a photo whose owner has no account is left out. */
    async gallery(entryId: string, viewerId: string | null) {
      const rows = await repository.datasheetPhotos(entryId, viewerId, DATASHEET_GALLERY_SIZE)
      const owners = await repository.namesByIds(rows.map((row) => row.userId))
      return rows.flatMap(({ userId, ...photo }) => {
        const owner = owners.get(userId)
        return owner ? [{ ...photo, owner }] : []
      })
    },

    like(userId: string, photoId: string, liked: boolean) {
      return repository.setCollectionPhotoLike({ userId, photoId, liked, now: clock() })
    },

    removeById(photoId: string) {
      return repository.removeCollectionPhotoById(photoId)
    },

    /** Holds the photo from everyone but its owner and administrators until one keeps or removes it; a kept photo is only flagged. */
    report(userId: string, photoId: string) {
      return repository.reportCollectionPhoto({ userId, photoId })
    },

    keep(photoId: string) {
      return repository.keepCollectionPhoto(photoId)
    },

    /** Reported photos awaiting a decision, oldest first. */
    async held() {
      return withOwners(await repository.heldCollectionPhotos(HELD_LIST_SIZE))
    },

    /** A page of the photos no report holds, newest first, so administrators can remove one nobody has reported yet. */
    async browse(before: AdminCollectionPhotosCursor | null) {
      const page = await repository.adminCollectionPhotos({ before, limit: ADMIN_PAGE_SIZE })
      return { photos: await withOwners(page.photos), nextCursor: page.nextCursor }
    },

    /** Whether `viewerId` may see the photo, and whose it is. */
    visibleTo(photoId: string, viewerId: string | null) {
      return repository.collectionPhoto(photoId, viewerId)
    },

    /** Administrators see every photo, including those reports hold. */
    async response(photoId: string, viewerId: string | null, admin = false, request?: Request) {
      if (!z.uuid().safeParse(photoId).success) return notFound()
      const photo = admin ? await repository.collectionPhotoForAdmin(photoId) : await repository.collectionPhoto(photoId, viewerId)
      if (!photo) return notFound()
      const thumbnail = request && new URL(request.url).searchParams.get('size') === 'thumbnail'
      const headers = { 'Cache-Control': 'private, no-cache', ETag: `"${photoId}${thumbnail ? '-thumbnail-v1' : ''}"` }
      if (request && ifNoneMatch(request, headers.ETag)) return new Response(null, { status: 304, headers })
      const objects = privateObjects()
      let response: Response
      if (thumbnail && objects) {
        const bytes = (await objects.get(collectionPhotoThumbnailKey(photoId))) ?? (await generateThumbnail(objects, photoId))
        response = bytes
          ? new Response(new Uint8Array(bytes), { headers: { 'Content-Type': 'image/webp', 'X-Content-Type-Options': 'nosniff' } })
          : notFound()
      } else response = await privateImageResponse(objects, `${PREFIX}${photoId}`)
      if (response.ok) {
        for (const [name, value] of Object.entries(headers)) response.headers.set(name, value)
      }
      return response
    },

    async backfillThumbnails() {
      const objects = privateObjects()
      const result = { generated: 0, failed: 0 }
      if (!objects) return result
      let after: string | null = null
      while (true) {
        const photoIds = await repository.collectionPhotoIds(after, DELETION_BATCH)
        if (!photoIds.length) return result
        for (const photoId of photoIds) {
          try {
            if (!(await objects.head(collectionPhotoThumbnailKey(photoId))) && (await generateThumbnail(objects, photoId)))
              result.generated++
          } catch (error) {
            result.failed++
            reportServerFailure({ event: 'collection_photo_thumbnail_failed', photoId, error })
          }
        }
        after = photoIds.at(-1)!
      }
    },

    /** Deletes stored objects whose photos are gone; safe to run on every replica at once, since deleting twice is harmless. */
    async drainDeletions() {
      const objects = privateObjects()
      if (!objects) return 0
      let deleted = 0
      for (let batch = 0; batch < DELETION_BATCHES_PER_DRAIN; batch += 1) {
        const photoIds = await repository.collectionPhotoDeletions(DELETION_BATCH)
        if (!photoIds.length) break
        await Promise.all(photoIds.map((photoId) => deleteObjects(objects, photoId)))
        await repository.clearCollectionPhotoDeletions(photoIds)
        deleted += photoIds.length
      }
      return deleted
    },
  }
}

export type CollectionPhotoStore = ReturnType<typeof collectionPhotoStore>

/** The email administrators receive when a player reports a photo; the reporter comes from the server session. */
export function collectionPhotoReportEmail(
  report: { photoId: string; ownerId: string; reason: string },
  reporter: { name: string; email: string },
  appUrl: string,
) {
  return {
    subject: 'Praetorium photo report',
    text: [
      `Reported by: ${reporter.name} <${reporter.email}>`,
      `Photo: ${new URL(collectionPhotoPath(report.photoId), appUrl).href}`,
      `Owner: ${new URL(`/users/${report.ownerId}?tab=collection`, appUrl).href}`,
      '',
      report.reason || 'No reason given.',
      '',
      `Review it at ${new URL('/admin?tab=photos', appUrl).href}. It stays hidden until you keep or remove it, unless an administrator kept it before.`,
    ].join('\n'),
  }
}

import { z } from 'zod'
import { COLLECTION_PHOTO_MAX_BYTES, collectionPhotoPath } from '../contracts/collection'
import { notFound } from './notFound'
import { privateImageResponse, type PrivateObjects, storePrivateImage } from './privateImages'
import type { SpacetimeRepository } from './spacetimeRepository'

const PREFIX = 'collection-photos/'
const DELETION_BATCH = 100
const DELETION_BATCHES_PER_DRAIN = 20
const DATASHEET_GALLERY_SIZE = 12
const HELD_LIST_SIZE = 100
const RECENT_LIST_SIZE = 24

type PhotoRepository = Pick<
  SpacetimeRepository,
  | 'setCollectionPhoto'
  | 'removeCollectionPhoto'
  | 'removeCollectionPhotoById'
  | 'collectionPhotoForAdmin'
  | 'reportCollectionPhoto'
  | 'keepCollectionPhoto'
  | 'heldCollectionPhotos'
  | 'recentCollectionPhotos'
  | 'setCollectionPhotoLike'
  | 'collectionPhoto'
  | 'datasheetPhotos'
  | 'collectionPhotoDeletions'
  | 'clearCollectionPhotoDeletions'
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
  /** Names each photo's owner, keeping a deleted owner's photo reviewable. */
  async function withOwners<Row extends { userId: string }>(rows: Row[]) {
    const owners = await repository.namesByIds(rows.map((row) => row.userId))
    return rows.map(({ userId, ...photo }) => ({ ...photo, owner: owners.get(userId) ?? { id: userId, name: 'Deleted player' } }))
  }

  return {
    async upload(userId: string, entryId: string, image: string) {
      const objects = privateObjects()
      const photoId = await storePrivateImage(objects, PREFIX, image, {
        maxBytes: COLLECTION_PHOTO_MAX_BYTES,
        refusal: 'Choose a JPEG, PNG or WebP photo.',
      })
      try {
        await repository.setCollectionPhoto({ userId, entryId, photoId, now: clock() })
      } catch (error) {
        await objects?.delete(`${PREFIX}${photoId}`).catch(() => undefined)
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

    /** The newest photos no report holds, so administrators can remove one nobody has reported yet. */
    async recent() {
      return withOwners(await repository.recentCollectionPhotos(RECENT_LIST_SIZE))
    },

    /** Whether `viewerId` may see the photo, and whose it is. */
    visibleTo(photoId: string, viewerId: string | null) {
      return repository.collectionPhoto(photoId, viewerId)
    },

    /** Administrators see every photo, including those reports hold. */
    async response(photoId: string, viewerId: string | null, admin = false) {
      if (!z.uuid().safeParse(photoId).success) return notFound()
      const photo = admin ? await repository.collectionPhotoForAdmin(photoId) : await repository.collectionPhoto(photoId, viewerId)
      if (!photo) return notFound()
      return privateImageResponse(privateObjects(), `${PREFIX}${photoId}`)
    },

    /** Deletes stored objects whose photos are gone; safe to run on every replica at once, since deleting twice is harmless. */
    async drainDeletions() {
      const objects = privateObjects()
      if (!objects) return 0
      let deleted = 0
      for (let batch = 0; batch < DELETION_BATCHES_PER_DRAIN; batch += 1) {
        const photoIds = await repository.collectionPhotoDeletions(DELETION_BATCH)
        if (!photoIds.length) break
        await Promise.all(photoIds.map((photoId) => objects.delete(`${PREFIX}${photoId}`)))
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

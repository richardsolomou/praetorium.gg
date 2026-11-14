import { z } from 'zod'
import { collectionProfileSchema } from '../../contracts/collection'
import type { CollectionImportRow } from '../../core/collection'
import { feedCursor, type SpacetimeBase } from './client'

/** A nullable procedure argument as SpacetimeDB's option type. */
const option = <T>(value: T | null) => (value === null ? { none: [] } : { some: value })

const collectionRow = z.object({
  userId: z.string(),
  entryId: z.string(),
  at: z.number().int(),
  models: z.number().int(),
  built: z.number().int().default(0),
  painted: z.number().int().default(0),
  countsAs: z.array(z.string()).default([]),
  photoIds: z.array(z.uuid()).optional(),
  photoShows: z.record(z.uuid(), z.string()).default({}),
})
const photoOwner = z.object({ userId: z.string(), entryId: z.string() })

export function withCollection<B extends SpacetimeBase>(Base: B) {
  return class CollectionOperations extends Base {
    async collectionProfile(userId: string, viewerId: string | null) {
      return this.read('collection_profile', [userId, option(viewerId)], collectionProfileSchema)
    }

    async collectionByUser(userId: string) {
      return this.read('collection_by_user', [userId], z.array(collectionRow))
    }

    async addToCollection(input: { userId: string; entryId: string; now: number }) {
      await this.call('add_to_collection', [input.userId, input.entryId, input.now])
    }

    async removeFromCollection(userId: string, entryId: string) {
      await this.call('remove_from_collection', [userId, entryId])
    }

    async setCollectionModels(input: { userId: string; entryId: string; models: number; now: number }) {
      await this.call('set_collection_models', [input.userId, input.entryId, input.models, input.now])
    }

    async setCollectionProgress(input: { userId: string; entryId: string; built: number; painted: number }) {
      await this.call('set_collection_progress', [input.userId, input.entryId, input.built, input.painted])
    }

    async setCollectionCountsAs(input: { userId: string; entryId: string; countsAs: string[] }) {
      await this.call('set_collection_counts_as', [input.userId, input.entryId, input.countsAs])
    }

    async collectionWishesByUser(userId: string) {
      return this.read(
        'collection_wishes_by_user',
        [userId],
        z.array(z.object({ entryId: z.string(), wanted: z.number().int().positive() })),
      )
    }

    async setCollectionWanted(input: { userId: string; entryId: string; wanted: number; now: number }) {
      await this.call('set_collection_wanted', [input.userId, input.entryId, input.wanted, input.now])
    }

    async importCollection(input: { userId: string; rows: CollectionImportRow[]; replace: boolean; now: number }) {
      return this.read(
        'import_collection',
        [input.userId, JSON.stringify(input.rows), input.replace, input.now],
        z.object({ added: z.number().int(), replaced: z.number().int(), kept: z.number().int() }),
      )
    }

    /** `shows` files the photo under another datasheet the row's models count as. */
    async setCollectionPhoto(input: { userId: string; entryId: string; shows?: string; photoId: string; now: number }) {
      if (input.shows && input.shows !== input.entryId)
        await this.call('set_collection_photo_as', [input.userId, input.entryId, input.shows, input.photoId, input.now])
      else await this.call('set_collection_photo', [input.userId, input.entryId, input.photoId, input.now])
    }

    async removeCollectionPhoto(userId: string, photoId: string) {
      await this.call('remove_collection_photo', [userId, photoId])
    }

    async collectionPhoto(photoId: string, viewerId: string | null) {
      return this.read('collection_photo', [photoId, option(viewerId)], photoOwner.nullable())
    }

    async datasheetPhotos(entryId: string, viewerId: string | null, limit: number) {
      return this.read(
        'datasheet_photos',
        [entryId, option(viewerId), limit],
        z
          .array(
            z.object({
              photoId: z.uuid(),
              userId: z.string(),
              at: z.number().int(),
              likes: z.number().int().nonnegative(),
              liked: z.boolean(),
            }),
          )
          .max(100),
      )
    }

    async setCollectionPhotoLike(input: { userId: string; photoId: string; liked: boolean; now: number }) {
      await this.call('set_collection_photo_like', [input.userId, input.photoId, input.liked, input.now])
    }

    async removeCollectionPhotoById(photoId: string) {
      await this.call('remove_collection_photo_by_id', [photoId])
    }

    async collectionPhotoForAdmin(photoId: string) {
      return this.read('collection_photo_for_admin', [photoId], photoOwner.nullable())
    }

    async reportCollectionPhoto(input: { userId: string; photoId: string }) {
      await this.call('report_collection_photo', [input.userId, input.photoId])
    }

    async keepCollectionPhoto(photoId: string) {
      await this.call('keep_collection_photo', [photoId])
    }

    async heldCollectionPhotos(limit: number) {
      return this.read(
        'held_collection_photos',
        [limit],
        z
          .array(z.object({ photoId: z.uuid(), userId: z.string(), entryId: z.string(), at: z.number().int(), shown: z.boolean() }))
          .max(100),
      )
    }

    async adminCollectionPhotos(input: { before: { at: number; id: string } | null; limit: number }) {
      return this.read(
        'admin_collection_photos',
        [JSON.stringify(input)],
        z.object({
          photos: z
            .array(
              z.object({
                photoId: z.uuid(),
                userId: z.string(),
                entryId: z.string(),
                at: z.number().int(),
                likes: z.number().int().nonnegative(),
                kept: z.boolean(),
              }),
            )
            .max(100),
          nextCursor: feedCursor.nullable(),
        }),
      )
    }

    async collectionPhotoDeletions(limit: number) {
      return this.read('collection_photo_deletions', [limit], z.array(z.string()).max(1_000))
    }

    async collectionPhotoIds(after: string | null, limit: number) {
      return this.read('collection_photo_ids', [option(after), limit], z.array(z.uuid()).max(100))
    }

    async clearCollectionPhotoDeletions(photoIds: readonly string[]) {
      await this.call('clear_collection_photo_deletions', [photoIds])
    }

    async queueCollectionPhotoDeletion(photoId: string) {
      await this.call('queue_collection_photo_deletion', [photoId])
    }
  }
}

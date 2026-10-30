import { z } from 'zod'
import { imageDataUrlMaxLength } from '../core/base64'
import { idSchema } from '../core/commands'
import { MAX_COLLECTION_MODELS, MAX_COLLECTION_DATASHEETS } from '../core/collection'
import { MAX_DATASHEET_PHOTOS } from '../core/collectionPhotos'

export const collectionModels = z.number().int().min(1).max(MAX_COLLECTION_MODELS)
export const collectionCount = z.number().int().min(0).max(MAX_COLLECTION_MODELS)

export const collectionProfileSchema = z
  .object({
    entries: z
      .array(
        z.object({
          entryId: z.string(),
          models: collectionModels,
          built: collectionCount.default(0),
          painted: collectionCount.default(0),
          photoIds: z.array(z.uuid()).max(MAX_DATASHEET_PHOTOS).optional(),
          photoShows: z.record(z.uuid(), z.string()).optional(),
        }),
      )
      .max(MAX_COLLECTION_DATASHEETS),
    wishes: z
      .array(z.object({ entryId: z.string(), wanted: collectionModels }))
      .max(MAX_COLLECTION_DATASHEETS)
      .default([]),
  })
  .nullable()

/** Browsers downscale a photo to about 1280 pixels before upload, which keeps a typical one well under this. */
export const COLLECTION_PHOTO_MAX_BYTES = 600_000

export const collectionPhotoSchema = z.object({
  entryId: idSchema,
  /** Another datasheet the entry's models count as, when the photo shows that build. */
  shows: idSchema.optional(),
  image: z.string().max(imageDataUrlMaxLength(COLLECTION_PHOTO_MAX_BYTES)),
})

export const collectionPhotoIdSchema = z.object({ photoId: z.uuid() })

export const collectionPhotoLikeSchema = collectionPhotoIdSchema.extend({ liked: z.boolean() })

export const collectionPhotoReportSchema = collectionPhotoIdSchema.extend({ reason: z.string().trim().max(500) })

const adminCollectionPhotosCursorSchema = z.object({ at: z.number().int().nonnegative(), id: z.uuid() })

export type AdminCollectionPhotosCursor = z.infer<typeof adminCollectionPhotosCursorSchema>

/** Without a cursor, the newest page. */
export const adminCollectionPhotosSchema = z.object({ before: adminCollectionPhotosCursorSchema.nullable() })

/** Where a collection photo is served; the route checks the owner still shares it on every read. */
export const collectionPhotoPath = (photoId: string, size: 'original' | 'thumbnail' = 'original') =>
  `/api/collection-photos/${photoId}${size === 'thumbnail' ? '?size=thumbnail' : ''}`

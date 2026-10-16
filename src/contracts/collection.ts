import { z } from 'zod'
import { collectionGroupsSchema, MAX_COLLECTION_MODELS, MAX_COLLECTION_DATASHEETS } from '../core/collection'
import { MAX_DATASHEET_PHOTOS } from '../core/collectionPhotos'

export const collectionProfileSchema = z
  .object({
    published: z.boolean(),
    entries: z
      .array(
        z.object({
          entryId: z.string(),
          models: z.number().int().min(1).max(MAX_COLLECTION_MODELS),
          groups: collectionGroupsSchema.optional(),
          photoIds: z.array(z.uuid()).max(MAX_DATASHEET_PHOTOS).optional(),
        }),
      )
      .max(MAX_COLLECTION_DATASHEETS),
  })
  .nullable()

export { collectionGroupsInputSchema } from '../core/collection'

/** Browsers downscale a photo to about 1280 pixels before upload, which keeps a typical one well under this. */
export const COLLECTION_PHOTO_MAX_BYTES = 600_000

/** Base64 grows bytes by a third; the prefix is at most `data:image/jpeg;base64,`. */
const COLLECTION_PHOTO_MAX_LENGTH = Math.ceil(COLLECTION_PHOTO_MAX_BYTES / 3) * 4 + 32

export const collectionPhotoSchema = z.object({ entryId: z.string().min(1).max(64), image: z.string().max(COLLECTION_PHOTO_MAX_LENGTH) })

export const collectionPhotoIdSchema = z.object({ photoId: z.uuid() })

export const collectionPhotoLikeSchema = collectionPhotoIdSchema.extend({ liked: z.boolean() })

export const collectionPhotoReportSchema = collectionPhotoIdSchema.extend({ reason: z.string().trim().max(500) })

/** Where a collection photo is served; the route checks the owner still shares it on every read. */
export const collectionPhotoPath = (photoId: string) => `/api/collection-photos/${photoId}`

export type { CollectionGroup } from '../core/collection'

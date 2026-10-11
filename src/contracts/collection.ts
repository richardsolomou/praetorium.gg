import { z } from 'zod'
import { MAX_COLLECTION_MODELS, MAX_COLLECTION_DATASHEETS } from '../core/collection'

export const collectionProfileSchema = z
  .object({
    published: z.boolean(),
    entries: z
      .array(z.object({ entryId: z.string(), models: z.number().int().min(1).max(MAX_COLLECTION_MODELS) }))
      .max(MAX_COLLECTION_DATASHEETS),
  })
  .nullable()

export type { CollectionGroup } from '../core/collection'

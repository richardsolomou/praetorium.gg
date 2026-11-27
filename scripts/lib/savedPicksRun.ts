import { z } from 'zod'
import { savedPicksPinSchema, savedPicksSchema } from '../../src/core/savedPicks'

/**
 * One translator run's local output, written only once every part of it is read: the copy's capture time, the key of
 * every pick its live records hold, and the translations. It names no list, but is derived from players' lists, so it
 * stays in `data-dev`.
 */
export const savedPicksRunSchema = z.strictObject({
  copiedAt: savedPicksPinSchema.shape.copiedAt,
  live: z.array(z.string().regex(/^[0-9a-f]{16}$/)),
  translations: savedPicksSchema,
})
export const SAVED_PICKS_RUN = 'data-dev/saved-picks.json'

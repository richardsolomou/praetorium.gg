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
  /** Keys two of the copy's picks translate differently, frozen for none and left for the final publication to settle. */
  disputed: z.array(z.string().regex(/^[0-9a-f]{16}$/)),
  translations: savedPicksSchema,
})

/**
 * The rules version a list of `catalogueId` keys its picks under: the version its catalogue loads as, never another's,
 * so a key the copy holds is the key a reader computes. A list whose catalogue does not load stops the run.
 */
export function rulesVersionOf(catalogueId: string, loaded: { edition?: { id: string } } | null, baseEdition: string) {
  const named = catalogueId.includes('~') ? catalogueId.slice(0, catalogueId.indexOf('~')) : null
  if (!loaded || (named !== null && loaded.edition?.id !== named))
    throw new Error(`a list of ${catalogueId} does not load as its own rules version`)
  return loaded.edition?.id ?? baseEdition
}
export const SAVED_PICKS_RUN = 'data-dev/saved-picks.json'

import raw from '../../catalogue/legacy-ids/bsdata-records.json' with { type: 'json' }
import { z } from 'zod'
import { legacyIdsSchema } from '../core/legacyIds'
import { bsdataRecords } from '../shared/vsData'

// A pair frozen as null has no record in the versions it reaches, as where the app prints no such rule on that datasheet.
const frozen = legacyIdsSchema.extend({ ids: z.record(z.string(), z.string().nullable()) }).parse(raw).ids

/** A rules version's `BsdataRecords`, from its release's identity entries and the frozen map; null for the base. */
export const bsdataRecordsIn = (entries: Readonly<Record<string, readonly string[]>>, edition: string | null) =>
  bsdataRecords(entries, frozen, edition)

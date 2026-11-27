import { z } from 'zod'
import raw from '../../catalogue/legacy-ids/bsdata-records.json' with { type: 'json' }
import { bsdataRecords } from '../shared/vsData'

const frozen = z.object({ format: z.literal('praetorium.legacy-ids.v1'), ids: z.record(z.string(), z.string().nullable()) }).parse(raw).ids

/** A rules version's `BsdataRecords`, from its release's identity entries and the frozen map; null for the base. */
export const bsdataRecordsIn = (entries: Readonly<Record<string, readonly string[]>>, edition: string | null) =>
  bsdataRecords(entries, frozen, edition)

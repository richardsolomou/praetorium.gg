import { z } from 'zod'
import { legacyIdsSchema } from '../core/legacyIds'
import type { LegacyImportIds } from '../shared/importNames'
import rawUnits from '../../catalogue/legacy-ids/units.json' with { type: 'json' }
import rawDetachmentIds from '../../catalogue/legacy-ids/detachments.json' with { type: 'json' }
import rawDatasheets from '../../catalogue/legacy-ids/datasheet-names.json' with { type: 'json' }
import rawDetachments from '../../catalogue/legacy-ids/detachment-names.json' with { type: 'json' }
import rawBooks from '../../catalogue/legacy-ids/book-names.json' with { type: 'json' }

/**
 * The names BSData gave each book, datasheet and Detachment, by the ID a saved roster holds, frozen when the catalogue last
 * read BSData. New Recruit prints them, so imports read its lists by them. Names are only added.
 */
export const legacyNamesSchema = z.object({
  format: z.literal('praetorium.legacy-names.v1'),
  names: z.record(z.string(), z.array(z.string())),
})

const namesOf = (raw: unknown): ReadonlyMap<string, readonly string[]> => new Map(Object.entries(legacyNamesSchema.parse(raw).names))

/** What imports join VS Data's names to saved rosters' IDs by. */
export const legacyImportIds: LegacyImportIds = {
  units: legacyIdsSchema.parse(rawUnits).ids,
  detachments: legacyIdsSchema.parse(rawDetachmentIds).ids,
  datasheetNames: namesOf(rawDatasheets),
  detachmentNames: namesOf(rawDetachments),
  bookNames: namesOf(rawBooks),
}

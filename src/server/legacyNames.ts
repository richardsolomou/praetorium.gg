import { z } from 'zod'
import { legacyRosterIds } from '../core/legacyRosterIds'
import type { LegacyImportIds } from '../shared/importNames'
import rawDatasheets from '../../catalogue/legacy-ids/datasheet-names.json' with { type: 'json' }
import rawDetachments from '../../catalogue/legacy-ids/detachment-names.json' with { type: 'json' }

/**
 * The names BSData gave each datasheet and Detachment, by the ID a saved roster holds, frozen when the catalogue last
 * read BSData. New Recruit prints them, so imports read its lists by them. Names are only added.
 */
export const legacyNamesSchema = z.object({
  format: z.literal('praetorium.legacy-names.v1'),
  names: z.record(z.string(), z.array(z.string())),
})

const namesOf = (raw: unknown): ReadonlyMap<string, readonly string[]> => new Map(Object.entries(legacyNamesSchema.parse(raw).names))

/** What imports join VS Data's names to saved rosters' IDs by. */
export const legacyImportIds: LegacyImportIds = {
  units: legacyRosterIds.units,
  detachments: legacyRosterIds.detachments,
  datasheetNames: namesOf(rawDatasheets),
  detachmentNames: namesOf(rawDetachments),
}

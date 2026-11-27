import { z } from 'zod'
import rawBooks from '../../catalogue/legacy-ids/books.json' with { type: 'json' }
import rawCorrections from '../../catalogue/legacy-ids/corrections.json' with { type: 'json' }
import rawDetachments from '../../catalogue/legacy-ids/detachments.json' with { type: 'json' }
import rawEnhancements from '../../catalogue/legacy-ids/enhancements.json' with { type: 'json' }
import rawUnits from '../../catalogue/legacy-ids/units.json' with { type: 'json' }
import { legacyIdsSchema, legacyOptionsSchema } from './legacyIds'

export const ROSTER_ID_SECTIONS = ['books', 'detachments', 'units', 'enhancements'] as const
export type RosterIdSection = (typeof ROSTER_ID_SECTIONS)[number]
type OptionsEntry = z.infer<typeof legacyOptionsSchema>['units'][string]

const correctionFields = { key: z.string(), from: z.string(), to: z.string(), reason: z.string().min(1) }
/**
 * Reviewed moves of frozen roster IDs, for when VS Data moves an alias it once gave, such as a datasheet to the faction
 * that now prints it. The frozen maps keep what they first froze; every reader takes `to` in its place, and a correction
 * whose `from` no longer matches what is frozen fails the read. An `options` correction moves a datasheet's entry in
 * `options.json` from unit `from` to unit `to`, replacing it with `entry`, re-derived against `to`. Corrections are only
 * added.
 */
export const legacyIdCorrectionsSchema = z.object({
  format: z.literal('praetorium.legacy-id-corrections.v1'),
  corrections: z.array(
    z.discriminatedUnion('section', [
      z.object({ section: z.enum(ROSTER_ID_SECTIONS), ...correctionFields }),
      z.object({ section: z.literal('options'), ...correctionFields, entry: legacyOptionsSchema.shape.units.valueType }),
    ]),
  ),
})
type Corrections = z.infer<typeof legacyIdCorrectionsSchema>['corrections']

/** A frozen map with its reviewed corrections applied. */
export function correctedIds(section: RosterIdSection, frozen: Readonly<Record<string, string>>, corrections: Corrections) {
  const ids = { ...frozen }
  for (const correction of corrections) {
    if (correction.section !== section) continue
    if (ids[correction.key] !== correction.from)
      throw new Error(`${section}: ${correction.key} is frozen as ${ids[correction.key]}, not ${correction.from} as its correction says`)
    ids[correction.key] = correction.to
  }
  return ids
}

/** The frozen `options.json` entries with their reviewed corrections applied. */
export function correctedOptions(frozen: Readonly<Record<string, OptionsEntry>>, corrections: Corrections) {
  const units = { ...frozen }
  for (const correction of corrections) {
    if (correction.section !== 'options') continue
    if (units[correction.key]?.unit !== correction.from || correction.entry.unit !== correction.to)
      throw new Error(
        `options: ${correction.key} is frozen for ${units[correction.key]?.unit}, not ${correction.from} as its correction says`,
      )
    units[correction.key] = correction.entry
  }
  return units
}

export const legacyIdCorrections = legacyIdCorrectionsSchema.parse(rawCorrections).corrections
const read = (section: RosterIdSection, raw: unknown) => correctedIds(section, legacyIdsSchema.parse(raw).ids, legacyIdCorrections)

/** The VS Data ID of each book, Detachment, datasheet and Enhancement ID a saved list can hold (`catalogue/legacy-ids/`). */
export const legacyRosterIds: Record<RosterIdSection, Readonly<Record<string, string>>> = {
  books: read('books', rawBooks),
  detachments: read('detachments', rawDetachments),
  units: read('units', rawUnits),
  enhancements: read('enhancements', rawEnhancements),
}

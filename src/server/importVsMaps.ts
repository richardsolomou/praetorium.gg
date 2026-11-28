import rawOptions from '../../catalogue/legacy-ids/options.json' with { type: 'json' }
import rawUnits from '../../catalogue/legacy-ids/units.json' with { type: 'json' }
import { legacyIdsSchema, legacyOptionsSchema } from '../core/legacyIds'
import type { ImportVsMaps } from '../shared/importedVsPicks'

let maps: ImportVsMaps | undefined

/** The frozen maps an import reads BSData picks into VS picks through; only the server holds them, so a device imports catalogue picks. */
export const importVsMaps = () =>
  (maps ??= { options: legacyOptionsSchema.parse(rawOptions).units, allegiances: legacyIdsSchema.parse(rawUnits).allegiances ?? {} })

import rawStratagems from '../../catalogue/legacy-ids/stratagems.json' with { type: 'json' }
import { legacyIds } from './legacyIds'

/** The VS Data ID of a Stratagem a battle, roster or simulator link stored by its Game Datacards ID. */
export const currentStratagemId = legacyIds(rawStratagems)

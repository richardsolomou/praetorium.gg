import type { Side } from '../../../sides'
import { PrebattleUnits } from './PrebattleUnits'

/**
 * Putting the armies on the table, which happens on the table.
 *
 * Nothing is recorded here: where a model stands is the board's business, and this
 * app has never claimed to know it. The section gathers the units that may be set up
 * outside the deployment zone, because they are read off individual datasheets and a
 * player who misses one finds out after both armies are down.
 */
export function DeployStep({ sides }: { sides: Side[] }) {
  return <PrebattleUnits sides={sides} rule="infiltrators" empty="No unit sets up outside the deployment zone." />
}

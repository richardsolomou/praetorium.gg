import type { Side } from '../../../sides'
import { PrebattleUnits } from './PrebattleUnits'

/**
 * What each side does between deploying and the first command phase.
 *
 * Nothing is recorded: a Scouts move happens on the table and the app has never
 * claimed to know where a model stands.
 */
export function PreBattleRulesStep({ sides }: { sides: Side[] }) {
  return <PrebattleUnits sides={sides} rule="scouts" empty="No unit has a pre-battle move." />
}

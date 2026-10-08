import { type Side, sideName } from '../../../sides'
import { PrebattleUnits } from './PrebattleUnits'
import { SetupNote } from './chrome'

type Props = {
  sides: Side[]
  /** The side taking the first turn, which is the side that resolves first. */
  first: Side | undefined
}

/**
 * What each side does between deploying and the first command phase.
 *
 * A Scouts move is made now rather than during the battle, and the order matters, so
 * the section says whose it is. Nothing is recorded: the move happens on the table
 * and the app has never claimed to know where a model stands.
 */
export function PreBattleRulesStep({ sides, first }: Props) {
  return (
    <div className="space-y-4">
      <SetupNote>
        Sides alternate resolving any pre-battle rules their units have
        {first ? `, starting with ${sideName(first)}, who takes the first turn` : ''}. Start battle opens the first Command phase.
      </SetupNote>
      <PrebattleUnits sides={sides} rule="scouts" empty="No unit has a pre-battle move." />
    </div>
  )
}

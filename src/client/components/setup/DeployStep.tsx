import { type Side, sideName } from '../../sides'
import { PrebattleUnits } from './PrebattleUnits'
import { SetupNote } from './chrome'

type Props = { sides: Side[]; defender: Side | undefined }

/**
 * Putting the armies on the table, which happens on the table.
 *
 * Nothing is recorded here: where a model stands is the board's business, and this
 * app has never claimed to know it. What the section is for is the two things a
 * player has to have straight before they start — who sets up first, and which of
 * their units may be set up outside the deployment zone.
 *
 * Those are worth gathering because they are read off individual datasheets, and a
 * player who misses one finds out after both armies are down.
 */
export function DeployStep({ sides, defender }: Props) {
  return (
    <div className="space-y-4">
      <SetupNote>
        Sides alternate setting up one unit at a time, wholly within their own deployment zone
        {defender ? `, starting with ${sideName(defender)} as the defender` : ''}. Once a side has finished, the other sets up whatever it
        has left. Units held in strategic reserves are not set up now.
      </SetupNote>
      <PrebattleUnits sides={sides} rule="infiltrators" empty="No unit sets up outside the deployment zone." />
    </div>
  )
}

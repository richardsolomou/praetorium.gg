import type { Command } from '../../../../core/battle'
import type { Side } from '../../../sides'
import { SetupPanel } from './chrome'
import { SetupSideChoice } from './SetupSideChoice'

type Props = { sides: Side[]; first: number | null; disabled: boolean; send: (command: Command) => void }

/**
 * The post-deployment first-turn roll-off, recorded rather than rolled.
 *
 * Recorded into the log rather than kept on the device that saw it, because the
 * section after this one both reads it — pre-battle rules are resolved starting with
 * whoever takes the first turn — and is where the battle is finally begun, which may
 * be from another seat entirely.
 */
export function FirstTurnStep({ sides, first, disabled, send }: Props) {
  return (
    <SetupPanel onboarding="battle-setup-first">
      <SetupSideChoice
        label="First turn"
        sides={sides}
        chosen={first}
        roles={{ chosen: 'Takes the first turn', other: 'Takes the second turn' }}
        disabled={disabled}
        onChoose={(index) => {
          // The side's captain stands for the side, the way the attacker is recorded.
          const captain = sides.find((side) => side.index === index)?.captain.id
          if (captain) send({ kind: 'set-first-turn', firstPlayerId: captain })
        }}
      />
    </SetupPanel>
  )
}

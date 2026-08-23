import type { Command } from '../../../core/battle'
import type { Side } from '../../sides'
import { SetupPanel } from './chrome'
import { SetupSideChoice } from './SetupSideChoice'

/**
 * Who attacks and who defends, which the players roll for rather than choose.
 *
 * The roll-off happens on the table; this records its outcome. Naming both roles on
 * the cards matters because the rules name them: a player is told to do things as
 * the Attacker all game, not only when the armies are put down.
 */
export function AttackerStep({
  sides,
  attackerId,
  token,
  send,
}: {
  sides: Side[]
  attackerId: string | null
  token: string
  send: (command: Command) => void
}) {
  const chosen = sides.find((side) => side.armies.some((army) => army.playerId === attackerId))?.index ?? null
  return (
    <SetupPanel>
      <SetupSideChoice
        label="Attacker"
        sides={sides}
        token={token}
        chosen={chosen}
        roles={{ chosen: 'Attacker · deploys second', other: 'Defender · deploys first' }}
        onChoose={(index) => {
          const playerId = sides.find((side) => side.index === index)?.captain.id
          if (playerId) send({ kind: 'set-attacker', attackerId: playerId })
        }}
      />
    </SetupPanel>
  )
}

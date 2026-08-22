import type { Command } from '../../../core/battle'
import type { Side } from '../../sides'
import { SetupSideChoice } from './SetupSideChoice'

export function AttackerStep({ sides, attackerId, send }: { sides: Side[]; attackerId: string | null; send: (command: Command) => void }) {
  const chosen = sides.find((side) => side.armies.some((army) => army.playerId === attackerId))?.index ?? null
  return (
    <SetupSideChoice
      label="Attacker"
      hint="The defender deploys first. The attacker deploys second."
      sides={sides}
      chosen={chosen}
      onChoose={(index) => {
        const playerId = sides.find((side) => side.index === index)?.captain.id
        if (playerId) send({ kind: 'set-attacker', attackerId: playerId })
      }}
    />
  )
}

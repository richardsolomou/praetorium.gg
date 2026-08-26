import type { Command } from '../../../core/battle'
import type { Side } from '../../sides'
import { SetupPanel } from './chrome'
import { SetupSideChoice } from './SetupSideChoice'

export function DefenderStep({
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
  const attacker = sides.find((side) => side.armies.some((army) => army.playerId === attackerId))
  const chosen = attacker ? (sides.find((side) => side.index !== attacker.index)?.index ?? null) : null
  return (
    <SetupPanel>
      <SetupSideChoice
        label="Defender"
        sides={sides}
        token={token}
        chosen={chosen}
        roles={{ chosen: 'Defender · deploys first', other: 'Attacker · deploys second' }}
        onChoose={(index) => {
          const opposingCaptain = sides.find((side) => side.index !== index)?.captain.id
          if (opposingCaptain) send({ kind: 'set-attacker', attackerId: opposingCaptain })
        }}
      />
    </SetupPanel>
  )
}

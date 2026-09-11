import { Button } from '@/components/ui/button'
import type { Command } from '../../../core/battle'
import { type Side, sideName } from '../../sides'
import { PrebattleUnits } from './PrebattleUnits'
import { SetupNote, SetupPanel } from './chrome'

type Props = {
  sides: Side[]
  /** The side taking the first turn, which is the side that resolves first. */
  first: Side | undefined
  ready: boolean
  pending: boolean
  send: (command: Command) => void
}

/**
 * What each side does between deploying and the first command phase.
 *
 * A Scouts move is made now rather than during the battle, and the order matters, so
 * the section says whose it is. Nothing is recorded: the move happens on the table
 * and the app has never claimed to know where a model stands.
 *
 * The battle is begun from here because this is the last thing the table does before
 * it, and because the first turn it was told about a section ago is what decides who
 * resolves these.
 */
export function PreBattleRulesStep({ sides, first, ready, pending, send }: Props) {
  if (!ready) {
    const waiting = sides.flatMap((side) => side.armies.filter((army) => !army.roster).map((army) => army.playerName))
    return <SetupNote>Waiting for {waiting.join(' and ') || 'the other side'} to choose an army before the battle can start.</SetupNote>
  }

  return (
    <div className="space-y-4">
      <SetupNote>
        Sides alternate resolving any pre-battle rules their units have
        {first ? `, starting with ${sideName(first)}, who takes the first turn` : ''}.
      </SetupNote>
      <PrebattleUnits sides={sides} rule="scouts" empty="No unit has a pre-battle move." />
      <SetupPanel>
        <Button
          className="h-12 w-full text-base"
          disabled={pending || !first}
          onClick={() => {
            const firstPlayerId = first?.captain.id
            if (firstPlayerId) send({ kind: 'begin-battle', firstPlayerId })
          }}
        >
          Start battle
        </Button>
      </SetupPanel>
    </div>
  )
}

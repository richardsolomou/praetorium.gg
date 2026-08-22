import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { Command } from '../../../core/battle'
import type { Side } from '../../sides'
import { SetupSideChoice } from './SetupSideChoice'

type Props = { sides: Side[]; ready: boolean; pending: boolean; send: (command: Command) => void }

/**
 * The roll-off, recorded rather than rolled: who attacks, and who takes the first
 * turn. Both are side decisions, so both are chosen by side.
 */
export function FirstTurnStep({ sides, ready, pending, send }: Props) {
  const [first, setFirst] = useState(sides[0]?.index ?? 0)
  const seatFor = (index: number) => sides.find((side) => side.index === index)?.captain.id

  if (!ready) {
    const waiting = sides.flatMap((side) => side.armies.filter((army) => !army.roster).map((army) => army.playerName))
    return (
      <p className="rounded-sm border border-edge bg-panel p-4 text-sm text-dim">
        Waiting for {waiting.join(' and ') || 'the other side'} to choose an army before the battle can start.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <SetupSideChoice
        label="First turn"
        hint="Whoever won the roll-off after deployment."
        sides={sides}
        chosen={first}
        onChoose={setFirst}
      />
      <Button
        className="h-12 w-full text-base"
        disabled={pending}
        onClick={() => {
          const firstPlayerId = seatFor(first)
          if (firstPlayerId) send({ kind: 'begin-battle', firstPlayerId })
        }}
      >
        Start battle
      </Button>
    </div>
  )
}

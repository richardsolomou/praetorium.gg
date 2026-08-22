import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { Command } from '../../../core/battle'
import { type Side, sideName } from '../../sides'
import { HEADING, tint } from '../battle/tints'

type Props = { sides: Side[]; ready: boolean; pending: boolean; send: (command: Command) => void }

/**
 * The roll-off, recorded rather than rolled: who attacks, and who takes the first
 * turn. Both are side decisions, so both are chosen by side.
 */
export function FirstTurnStep({ sides, ready, pending, send }: Props) {
  const [attacker, setAttacker] = useState(sides[0]?.index ?? 0)
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
      <SideChoice
        label="Attacker"
        hint="The defender deploys first. The attacker deploys second."
        sides={sides}
        chosen={attacker}
        onChoose={setAttacker}
      />
      <SideChoice label="First turn" hint="Whoever won the roll-off after deployment." sides={sides} chosen={first} onChoose={setFirst} />
      <Button
        className="h-12 w-full text-base"
        disabled={pending}
        onClick={() => {
          const firstPlayerId = seatFor(first)
          const attackerId = seatFor(attacker)
          if (firstPlayerId) send({ kind: 'begin-battle', firstPlayerId, attackerId })
        }}
      >
        Start battle
      </Button>
    </div>
  )
}

function SideChoice({
  label,
  hint,
  sides,
  chosen,
  onChoose,
}: {
  label: string
  hint: string
  sides: Side[]
  chosen: number
  onChoose: (index: number) => void
}) {
  return (
    <fieldset>
      <legend className={HEADING}>{label}</legend>
      <p className="mt-0.5 text-xs text-dim">{hint}</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {sides.map((side) => (
          <Button
            key={side.index}
            variant="outline"
            aria-pressed={side.index === chosen}
            className={`h-auto justify-start border-t-2 px-3 py-2 text-left ${tint(side.index).edge} ${
              side.index === chosen ? 'bg-parchment/10 ring-2 ring-parchment' : ''
            }`}
            onClick={() => onChoose(side.index)}
          >
            <span className="min-w-0">
              <span className={`block truncate text-sm font-bold uppercase ${tint(side.index).text}`}>{sideName(side)}</span>
              <span className="block truncate text-[0.625rem] font-normal text-dim">
                {side.armies.map((army) => army.roster?.name ?? 'No army').join(' · ')}
              </span>
            </span>
          </Button>
        ))}
      </div>
    </fieldset>
  )
}

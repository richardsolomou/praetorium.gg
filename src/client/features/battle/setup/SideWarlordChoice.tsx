import { Crown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Command } from '../../../../core/battle'
import { type Side, sideName } from '../../../sides'
import { SidePlayers } from '../PlayerName'
import { CHOOSABLE, CHOSEN, SetupNote, SetupPanel } from './chrome'

/** Ask allies whose Warlord leads their side, since each list names its own. */
export function SideWarlordChoice({ sides, send }: { sides: Side[]; send: (command: Command) => void }) {
  const asked = sides.filter((side) => side.warlordChoices.length > 1)
  if (!asked.length) return null

  return (
    <SetupPanel className="space-y-2">
      <p className="eyebrow">Warlord</p>
      <SetupNote>Each list names its own Warlord. Allies field one between them, so choose whose leads the side.</SetupNote>
      {asked.map((side) => (
        <fieldset key={side.index} className="flex flex-wrap items-center justify-between gap-2">
          <legend className="sr-only">Warlord for {sideName(side)}</legend>
          <SidePlayers side={side} linked={false} />
          <span className="flex flex-wrap gap-1">
            {side.warlordChoices.map((playerId) => {
              const army = side.armies.find((candidate) => candidate.playerId === playerId)
              const unit = army?.units.find((candidate) => candidate.warlord)?.name ?? 'Warlord'
              const chosen = side.warlord === playerId
              return (
                <Button
                  key={playerId}
                  variant="outline"
                  size="xs"
                  aria-pressed={chosen}
                  aria-label={`Make ${army?.playerName ?? 'this player'}’s ${unit} the Warlord for ${sideName(side)}`}
                  className={`gap-1 ${chosen ? CHOSEN : CHOOSABLE}`}
                  onClick={() => send({ kind: 'set-side-warlord', side: side.index, playerId })}
                >
                  <Crown className={`size-3 ${chosen ? 'fill-current' : ''}`} aria-hidden />
                  {unit} · {army?.playerName}
                </Button>
              )
            })}
          </span>
        </fieldset>
      ))}
    </SetupPanel>
  )
}

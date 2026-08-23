import { Button } from '@/components/ui/button'
import type { Side } from '../../sides'
import { ArmyIdentity } from '../ArmyIdentity'
import { SidePlayers } from '../PlayerName'
import { tint } from '../battle/tints'
import { CHOOSABLE, CHOSEN } from './chrome'

/**
 * Pick a side, for the two questions setup asks about one.
 *
 * The legend is the name this is found by and nothing more: the step above it has
 * already asked the question and said what the answer means, and printing both again
 * over the two cards said everything on the screen twice.
 *
 * Each card carries who is on the side and what they brought, because these are
 * questions about the armies facing each other and a side name alone is not enough
 * to answer one at a table where nobody has memorised the seating.
 */
export function SetupSideChoice({
  label,
  sides,
  token,
  chosen,
  roles,
  onChoose,
}: {
  label: string
  sides: Side[]
  token: string
  chosen: number | null
  /** What each side becomes once one is picked: the one picked, then the other. */
  roles?: { chosen: string; other: string }
  onChoose: (index: number) => void
}) {
  return (
    <fieldset>
      <legend className="sr-only">{label}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {sides.map((side) => {
          const picked = side.index === chosen
          const role = chosen === null ? null : picked ? roles?.chosen : roles?.other
          return (
            <Button
              key={side.index}
              variant="outline"
              aria-pressed={picked}
              className={`h-auto flex-col items-stretch gap-1.5 border-t-2 px-3 py-2.5 text-left ${tint(side.index).edge} ${
                picked ? CHOSEN : CHOOSABLE
              }`}
              onClick={() => onChoose(side.index)}
            >
              {/* Unlinked throughout: the card itself is the control. */}
              <SidePlayers side={side} linked={false} />
              {side.armies.map((army) => (
                <ArmyIdentity key={army.playerId} army={army} token={token} linked={false} />
              ))}
              {role ? (
                <span className={`text-[0.6875rem] font-bold tracking-[0.06em] uppercase ${picked ? tint(side.index).text : 'text-dim'}`}>
                  {role}
                </span>
              ) : null}
            </Button>
          )
        })}
      </div>
    </fieldset>
  )
}

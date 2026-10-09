import { FIXED_SECONDARIES } from '../../../../core/battle'
import type { BattleView } from '../../../../core/battleView'
import { fixedHandShort, type Side } from '../../../sides'
import type { SendCommand } from '../useCommand'
import { Prep } from './Prep'
import { SetupSidePanel } from './chrome'

type Props = { view: BattleView; sides: Side[]; send: SendCommand; pending: boolean }

/**
 * The one card decision each side actually makes: how its secondaries are drawn.
 *
 * Both sides stay visible so the table can see what is still outstanding and either
 * player can referee the choices for both sides from one device.
 */
export function SecondariesStep({ view, sides, send, pending }: Props) {
  return (
    <div data-onboarding="battle-setup-secondaries" className={`grid gap-3 ${sides.length > 1 ? 'lg:grid-cols-2' : ''}`}>
      {sides.map((side) => {
        const short = fixedHandShort(side)
        return (
          <SetupSidePanel key={side.index} side={side} className="space-y-3">
            {/* Said where the choice is made, because a hand short of its two stops the battle starting. */}
            {short ? (
              <p className="text-xs font-bold text-discarded uppercase">
                Need {FIXED_SECONDARIES}, selected {side.secondaries.length}
              </p>
            ) : null}
            <p className="text-xs text-dim">{cardsBlurb(side)}</p>
            {/* Each side's primary follows from its own matchup, which the fold already put on it. */}
            <Prep view={view} side={side} missionId={side.mission?.id ?? null} send={send} pending={pending} />
          </SetupSidePanel>
        )
      })}
    </div>
  )
}

/**
 * What is worth saying about a side's cards beyond what the panel already shows.
 *
 * The same sentence for every side. A seat nobody signs in to is named at the top of
 * its own panel, which is the whole of why the table is settling it — saying so again
 * in the one place that explains how the cards work only left that panel with less
 * than the panel beside it.
 */
function cardsBlurb(side: Side): string {
  return side.armies.length > 1
    ? 'You and your ally play one hand of mission cards and one set of stratagems.'
    : 'Your stratagems come from your detachment. Only how the secondaries are drawn is a choice.'
}

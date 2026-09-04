import { FIXED_SECONDARIES } from '../../../core/battle'
import type { BattleView } from '../../../core/battleView'
import type { Side } from '../../sides'
import type { SendCommand } from '../../useCommand'
import { Prep } from '../Prep'
import { SetupSidePanel } from './chrome'

type Props = { view: BattleView; sides: Side[]; send: SendCommand; pending: boolean }

/**
 * The one card decision each side actually makes: how its secondaries are drawn.
 *
 * Its own section rather than sharing one with the reserves, because it is the last
 * thing the table agrees before the roll-off and it is a different conversation —
 * the reserves are each army's, and this belongs to the side.
 *
 * Both sides stay visible so the table can see what is still outstanding. A player
 * chooses only for their side, except when the battle format mandates tactical play.
 */
export function SecondariesStep({ view, sides, send, pending }: Props) {
  return (
    <div className={`grid gap-3 ${sides.length > 1 ? 'lg:grid-cols-2' : ''}`}>
      {sides.map((side) => (
        <SetupSidePanel key={side.index} side={side} className="space-y-3">
          {/* Said where the choice is made, because a hand short of its two is the one
              thing on this section that stops the table moving on. */}
          {side.secondaryMode === 'fixed' && side.secondaries.length < FIXED_SECONDARIES ? (
            <p className="text-xs font-bold text-discarded uppercase">
              Need {FIXED_SECONDARIES}, selected {side.secondaries.length}
            </p>
          ) : null}
          <p className="text-xs text-dim">{cardsBlurb(side)}</p>
          {/* Each side's primary follows from its own matchup, which the fold already put on it. */}
          <Prep view={view} side={side} missionId={side.mission?.id ?? null} send={send} pending={pending} />
        </SetupSidePanel>
      ))}
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

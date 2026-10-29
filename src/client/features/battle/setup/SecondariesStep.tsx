import { useQueries } from '@tanstack/react-query'
import { FIXED_SECONDARIES } from '../../../../core/battle'
import type { BattleView } from '../../../../core/battleView'
import { detachmentRulesQuery } from '../../../queries'
import { fixedHandShort, type Side } from '../../../sides'
import { armyRulesRequest } from '../sideRules'
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
  // The dataslate is the instance's rather than any one army's, so it is said once under both sides.
  const requests = sides.flatMap((side) => side.armies.map((army) => armyRulesRequest(army.roster)))
  const rules = useQueries({ queries: requests.map((request) => detachmentRulesQuery(request.catalogueId, request.detachmentNames)) })
    .map((result) => result.data)
    .find((data) => data)
  return (
    <div className="space-y-2">
      <div className={`grid items-start gap-6 ${sides.length > 1 ? 'md:grid-cols-2' : ''}`}>
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
              {/* Each side's primary follows from its own matchup, which the fold already put on it. */}
              <Prep view={view} side={side} missionId={side.mission?.id ?? null} send={send} pending={pending} />
            </SetupSidePanel>
          )
        })}
      </div>
      {rules?.dataslate ? <p className="text-2xs text-dim">{rules.dataslate.replaceAll('-', ' ')}</p> : null}
    </div>
  )
}

import { Link } from '@tanstack/react-router'
import { useId } from 'react'
import { Switch } from '@/components/ui/switch'
import type { BattleView } from '../../../core/battleView'
import { teamsBattlePoints } from '../../../core/teamsBattlePoints'
import { sideName, type Side } from '../../sides'
import { useStoredValue, writeStoredValue } from '../../storedValue'

const SHOWN_KEY = 'praetorium-teams-battle-points'

/** Why a finished battle has no battle points under the Teams Event Companion, or null when it has them. */
export function teamsBattlePointsGap(view: Pick<BattleView, 'result'>, sides: readonly Pick<Side, 'armies'>[]) {
  if (view.result?.reason === 'conceded') return 'A conceded battle has no battle points: they come from both players’ victory points.'
  if (sides.length !== 2 || sides.some((side) => side.armies.length !== 1))
    return 'Battle points compare two players’ victory points, so a team battle has none.'
  return null
}

/**
 * The Teams Event Companion's 20–0 battle points beside each player's victory points, shown only when the reader
 * asks for them; the battle's result and standings never use them.
 */
export function TeamsBattlePoints({ view, sides }: { view: Pick<BattleView, 'result'>; sides: readonly Side[] }) {
  const switchId = useId()
  const shown = useStoredValue(SHOWN_KEY) === 'true'
  const choose = (next: boolean) => writeStoredValue(SHOWN_KEY, String(next))
  const gap = teamsBattlePointsGap(view, sides)
  const [first, second] = sides
  return (
    <div data-teams-battle-points className="space-y-2">
      <label htmlFor={switchId} className="flex items-center justify-between gap-3">
        <span className="eyebrow">Teams event scoring</span>
        <Switch id={switchId} checked={shown} onCheckedChange={choose} />
      </label>
      {shown ? (
        gap || !first || !second ? (
          <p className="text-xs text-dim">{gap}</p>
        ) : (
          <>
            <dl className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-3 gap-y-1 text-xs">
              {[
                [first, second],
                [second, first],
              ].map(([side, opponent]) => (
                <div key={side!.index} className="contents">
                  <dt className="truncate">{sideName(side!)}</dt>
                  <dd className="readout text-right text-dim">{side!.total} VP</dd>
                  <dd className="readout text-right font-semibold text-bone">{teamsBattlePoints(side!.total, opponent!.total)} BP</dd>
                </div>
              ))}
            </dl>
            <p className="text-2xs text-dim">
              20–0 battle points from{' '}
              <Link
                to="/rules/$documentId/$sectionId"
                params={{ documentId: 'event-companion', sectionId: 'teams-event-companion' }}
                hash="8d2f85e7-938f-4d27-ab3d-cd90d5ea72ce"
                className="text-info hover:text-parchment"
              >
                Teams Event Companion, 14. Team scoring
              </Link>
              . The battle’s result and standings still use victory points.
            </p>
          </>
        )
      ) : null}
    </div>
  )
}

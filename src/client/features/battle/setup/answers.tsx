import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { FIXED_SECONDARIES } from '../../../../core/battle'
import { attachedUnitList } from '../../../../core/attachedUnits'
import { fixedHandShort, missionCardsReady, type Side } from '../../../sides'
import { countLabel } from '../../../text'
import { prebattleCounts } from './PrebattleUnits'

/** One side's answer to a step: what it is, then what it means. Inline throughout, since the side switch is a button. */
function Answer({ value, detail, tone }: { value: ReactNode; detail?: ReactNode; tone?: 'needed' | 'quiet' }) {
  return (
    <>
      <span
        className={cn(
          'block font-bold break-words uppercase',
          tone === 'needed' ? 'text-discarded' : tone === 'quiet' ? 'font-normal text-dim normal-case' : undefined,
        )}
      >
        {value}
      </span>
      {detail ? <span className="block text-xs text-dim">{detail}</span> : null}
    </>
  )
}

export function MissionAnswer({
  side,
  nameDisposition,
}: {
  side: Side
  nameDisposition: (id: string | null | undefined) => { id: string; name: string } | null
}) {
  const disposition = nameDisposition(side.disposition)?.name
  if (!side.mission) return <Answer value={side.dispositionChoices.length > 1 ? 'Choose a disposition' : 'No mission yet'} tone="quiet" />
  return <Answer value={side.mission.name} detail={disposition} />
}

export function SecondariesAnswer({ side, ready }: { side: Side; ready: boolean }) {
  if (!ready) return <Answer value="After the armies" tone="quiet" />
  if (side.secondaryMode === 'fixed')
    return fixedHandShort(side) ? (
      <Answer value="Fixed" detail={`${side.secondaries.length} of ${FIXED_SECONDARIES} chosen`} tone="needed" />
    ) : (
      <Answer value="Fixed" detail={side.secondaries.map((card) => card.name).join(' · ')} />
    )
  return <Answer value="Tactical" detail={missionCardsReady(side) ? 'Drawn as the battle runs' : 'Dealing the deck'} />
}

export function ReservesAnswer({ side }: { side: Side }) {
  const units = side.armies.flatMap((army) => attachedUnitList(army.units))
  if (!units.length) return <Answer value="No units yet" tone="quiet" />
  const held = units.filter((unit) => unit.host.formation !== 'battlefield').length
  return (
    <Answer
      value={held ? `${held} held back` : 'All on the table'}
      detail={`${units.length - held} of ${countLabel(units.length, 'unit')} deploy`}
    />
  )
}

export function PrebattleAnswer({ side, rule }: { side: Side; rule: 'infiltrators' | 'scouts' }) {
  const { onTable, carrying } = prebattleCounts(side, rule)
  if (!onTable) return <Answer value="No units yet" tone="quiet" />
  return rule === 'infiltrators' ? (
    <Answer value={`${onTable} to deploy`} detail={carrying ? `${carrying} infiltrating` : 'None infiltrating'} />
  ) : (
    <Answer value={carrying ? countLabel(carrying, 'scout') : 'No moves'} detail="Before the first turn" />
  )
}

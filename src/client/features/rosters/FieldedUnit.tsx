import type { SubmittedUnit } from '../../../core/battle'
import { countLabel } from '../../text'
import { PointsChip } from './builder/PointsChip'

/**
 * A frozen unit as its battle recorded it, for when its datasheet can no longer be read on the rules version it was
 * fielded under, or could not be loaded at all (`failed`).
 */
export function FieldedUnit({ unit, failed = false }: { unit: SubmittedUnit; failed?: boolean }) {
  const taken = [
    ...(unit.wargear ?? []).map((piece) => `${piece.count}× ${piece.name}`),
    ...(unit.enhancements ?? []),
    ...(unit.upgrades ?? []),
  ]
  return (
    <div data-fielded-unit className="space-y-2 p-3 text-xs">
      {failed ? (
        <p role="alert" className="text-faint">
          This loadout could not be loaded. This is what the list recorded.
        </p>
      ) : (
        <p className="text-faint">
          The datasheet for the rules version this unit was played under is no longer available. This is what the list recorded.
        </p>
      )}
      <p className="flex flex-wrap items-center gap-1.5">
        <PointsChip points={unit.points} />
        <span className="chip normal-case">{countLabel(unit.models, 'model')}</span>
      </p>
      {taken.length ? (
        <ul className="space-y-0.5">
          {taken.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

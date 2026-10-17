import type { MissionSelectionView } from '../../../core/battleView'
import { countLabel } from '../../text'

function RecordedUnit({ unit }: { unit: MissionSelectionView['units'][number] | undefined }) {
  return (
    <>
      {unit?.name ?? 'Recorded unit'}
      {unit && unit.status !== 'battlefield' ? <span className="text-faint"> ({unit.status})</span> : null}
    </>
  )
}

export function MissionSelectionRecords({ records, cardKey }: { records: MissionSelectionView[]; cardKey: string }) {
  const saved = records.filter((record) => record.cardKey === cardKey)
  if (!saved.length) return null
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-info">Choices</summary>
      <ul className="mt-1 space-y-1.5">
        {saved.map((record) => (
          <li key={`${record.selection.kind}:${record.occurrence}`} className="space-y-0.5">
            <p className="flex flex-wrap gap-x-2 text-faint">
              <span>R{record.round}</span>
              {record.expired ? <span>expired</span> : null}
              {record.selection.kind === 'beacon' || record.selection.kind === 'sensor-sweep' ? <span>manual</span> : null}
              {record.selection.kind === 'sensor-sweep' ? <span>Sensor Sweep</span> : null}
              {record.selection.kind === 'locate-and-deny' ? (
                <span>{countLabel(record.selection.areas.length, 'operation marker')}</span>
              ) : null}
              {record.selection.kind === 'consecrate' ? (
                <span>{countLabel(record.selection.consecrations.length, 'consecrated objective')}</span>
              ) : null}
              {record.selection.kind === 'guards' ? <span>{countLabel(record.selection.guards.length, 'guard nomination')}</span> : null}
              {record.selection.kind === 'punishment' ? (
                <span>
                  {record.selection.unavailable
                    ? 'No enemy unit on the battlefield'
                    : `${countLabel(record.selection.units.length, 'condemned unit')}${record.selection.fallback ? ' · fallback' : ''}`}
                </span>
              ) : null}
            </p>
            {record.selection.kind === 'guards' || record.selection.kind === 'consecrate' ? (
              (record.selection.kind === 'guards' ? record.selection.guards : record.selection.consecrations).map((guard) => (
                <p key={guard.objective.key}>
                  {guard.objective.name} ·{' '}
                  <RecordedUnit
                    unit={record.units.find(
                      (unit) =>
                        unit.playerId === guard.unit.playerId &&
                        unit.rosterSeq === guard.unit.rosterSeq &&
                        unit.unitKey === guard.unit.unitKey,
                    )}
                  />
                </p>
              ))
            ) : record.selection.kind === 'tempting-target' ? (
              <p>{record.selection.objective.name}</p>
            ) : record.selection.kind === 'sensor-sweep' ? (
              <p>Removed {record.selection.marker.name}</p>
            ) : record.selection.kind === 'locate-and-deny' ? (
              record.selection.areas.map((area) => (
                <p key={area.key}>
                  {area.name}
                  {record.removedMarkers?.[area.key] ? (
                    <span className="text-faint"> (removed R{record.removedMarkers[area.key]})</span>
                  ) : null}
                </p>
              ))
            ) : null}
            {record.selection.kind !== 'guards' && record.selection.kind !== 'consecrate' && record.units.length ? (
              <p className="flex flex-wrap gap-x-2">
                {record.units.map((unit) => (
                  <span key={JSON.stringify([unit.playerId, unit.rosterSeq, unit.unitKey])}>
                    <RecordedUnit unit={unit} />
                  </span>
                ))}
              </p>
            ) : null}
            {record.selection.kind === 'beacon' && record.selection.note ? <p>{record.selection.note}</p> : null}
          </li>
        ))}
      </ul>
    </details>
  )
}

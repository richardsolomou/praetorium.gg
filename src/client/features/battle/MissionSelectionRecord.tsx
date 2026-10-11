import type { MissionSelectionView } from '../../../core/battleView'

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
          <li key={record.occurrence} className="space-y-0.5">
            <p className="flex flex-wrap gap-x-2 text-faint">
              <span>R{record.round}</span>
              {record.expired ? <span>expired</span> : null}
              {record.selection.kind === 'beacon' ? <span>manual</span> : null}
              {record.selection.kind === 'guards' ? (
                <span>{`${record.selection.guards.length} guard ${record.selection.guards.length === 1 ? 'nomination' : 'nominations'}`}</span>
              ) : null}
              {record.selection.kind === 'punishment' ? (
                <span>
                  {record.selection.unavailable
                    ? 'No enemy unit on the battlefield'
                    : `${record.selection.units.length} condemned ${record.selection.units.length === 1 ? 'unit' : 'units'}${record.selection.fallback ? ' · fallback' : ''}`}
                </span>
              ) : null}
            </p>
            {record.selection.kind === 'guards' ? (
              record.selection.guards.map((guard) => (
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
            ) : null}
            {record.selection.kind !== 'guards' && record.units.length ? (
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

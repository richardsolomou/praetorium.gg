import type { MissionSelectionView } from '../../../core/battleView'

export function MissionSelectionRecords({ records, cardKey }: { records: MissionSelectionView[]; cardKey: string }) {
  const saved = records.filter((record) => record.cardKey === cardKey)
  if (!saved.length) return null
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-info">Recorded choices · {saved.length}</summary>
      <ul className="mt-2 space-y-2">
        {saved.map((record) => (
          <li key={record.occurrence} className="space-y-1">
            <p className="eyebrow">
              Round {record.round}
              {record.expired ? ' · expired' : ''}
              {record.selection.kind === 'beacon' ? ' · manual' : ''}
            </p>
            {record.selection.kind === 'guards' ? (
              <p>
                {record.selection.guards.length} guard {record.selection.guards.length === 1 ? 'nomination' : 'nominations'}
              </p>
            ) : null}
            {record.selection.kind === 'guards' ? (
              record.selection.guards.map((guard) => (
                <p key={guard.objective.key}>
                  {guard.objective.name} ·{' '}
                  {record.units.find((unit) => unit.playerId === guard.unit.playerId && unit.unitKey === guard.unit.unitKey)?.name ??
                    'Recorded unit'}
                </p>
              ))
            ) : record.selection.kind === 'tempting-target' ? (
              <p>{record.selection.objective.name}</p>
            ) : null}
            {record.units.map((unit) => (
              <p key={JSON.stringify([unit.playerId, unit.rosterSeq, unit.unitKey])}>
                {unit.name} · {unit.status}
              </p>
            ))}
            {record.selection.kind === 'punishment' ? (
              <p>
                {record.selection.unavailable
                  ? 'No enemy unit on the battlefield'
                  : `${record.selection.units.length} condemned ${record.selection.units.length === 1 ? 'unit' : 'units'}${record.selection.fallback ? ' · fallback' : ''}`}
              </p>
            ) : null}
            {record.selection.kind === 'beacon' && record.selection.note ? <p>{record.selection.note}</p> : null}
          </li>
        ))}
      </ul>
    </details>
  )
}

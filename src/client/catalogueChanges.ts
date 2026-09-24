import type { CatalogueChange, PointsRowChange } from '../core/catalogueChanges'

const shown = (points: string | null) => points ?? '—'

const rowText = (row: PointsRowChange) =>
  [
    row.models ? `${row.models} ${row.models === '1' ? 'model' : 'models'}` : null,
    row.condition ? `(${row.condition})` : null,
    `${shown(row.from)} → ${shown(row.to)} pts`,
  ]
    .filter(Boolean)
    .join(' ')

/** What happened to the thing a change names, without its name: `80 → 90 pts`, `Removed`. */
export function changeDetail(change: CatalogueChange) {
  switch (change.kind) {
    case 'datasheet-points':
      return change.rows.map(rowText).join(', ')
    case 'detachment-points':
      return `${shown(change.from)} → ${shown(change.to)} DP`
    case 'enhancement-points':
      return `${shown(change.from)} → ${shown(change.to)} pts`
    case 'datasheet-added':
    case 'detachment-added':
    case 'enhancement-added':
      return 'New'
    default:
      return 'Removed'
  }
}

/** The whole change in one line, as a list names it: `Intercessor Squad 80 → 90 pts`. */
export function changeLine(change: CatalogueChange) {
  const name = 'detachment' in change ? `${change.name} (${change.detachment})` : change.name
  const detail = changeDetail(change)
  if (detail === 'Removed' || detail === 'New') return `${name} ${detail === 'New' ? 'added' : 'removed'}`
  return `${name} ${detail}`
}

export type ChangeSection = 'Datasheets' | 'Detachments' | 'Enhancements' | 'Upgrades'

export function changeSection(change: CatalogueChange): ChangeSection {
  if (change.kind.startsWith('datasheet')) return 'Datasheets'
  if (change.kind.startsWith('detachment')) return 'Detachments'
  return 'detachment' in change && change.upgrade ? 'Upgrades' : 'Enhancements'
}

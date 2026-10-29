import type { CatalogueChange, PointsRowChange } from '../core/catalogueChanges'
import { groupBy } from '../core/collections'
import { countLabel } from './text'

const shown = (points: readonly (string | null)[]) => points.filter((price) => price !== null).join(' / ') || '—'

/**
 * Each size and condition a datasheet's change moved, as one line apiece. A size priced several
 * ways the change could not tell apart lists every price on each side rather than pairing them.
 */
export function pointsRows(rows: readonly PointsRowChange[]) {
  return [...groupBy(rows, (row) => JSON.stringify([row.models, row.condition])).values()].map((same) => {
    const { models, condition } = same[0]!
    return [
      models ? `${models} ${models === '1' ? 'model' : 'models'}` : null,
      condition ? `(${condition})` : null,
      `${shown(same.map((row) => row.from))} → ${shown(same.map((row) => row.to))} pts`,
    ]
      .filter(Boolean)
      .join(' ')
  })
}

/** What happened to the thing a change names, without its name: `80 → 90 pts`, `Removed`. */
export function changeDetail(change: CatalogueChange) {
  switch (change.kind) {
    case 'datasheet-points':
      return pointsRows(change.rows).join(', ')
    case 'detachment-points':
      return `${shown([change.from])} → ${shown([change.to])} DP`
    case 'enhancement-points':
      return `${shown([change.from])} → ${shown([change.to])} pts`
    case 'datasheet-added':
    case 'detachment-added':
    case 'enhancement-added':
      return 'Added'
    default:
      return 'Removed'
  }
}

/** The whole change in one line, as a list names it: `Intercessor Squad 80 → 90 pts`. */
export function changeLine(change: CatalogueChange) {
  const name = 'detachment' in change ? `${change.name} (${change.detachment})` : change.name
  const detail = changeDetail(change)
  if (detail === 'Removed' || detail === 'Added') return `${name} ${detail.toLowerCase()}`
  return `${name} ${detail}`
}

export const CHANGE_SECTIONS = ['Datasheets', 'Detachments', 'Enhancements', 'Upgrades'] as const
export type ChangeSection = (typeof CHANGE_SECTIONS)[number]

export function changeSection(change: CatalogueChange): ChangeSection {
  if (change.kind.startsWith('datasheet')) return 'Datasheets'
  if (change.kind.startsWith('detachment')) return 'Detachments'
  return 'detachment' in change && change.upgrade ? 'Upgrades' : 'Enhancements'
}

export const CHANGE_OUTCOMES = ['repriced', 'removed', 'added'] as const

export const changeOutcome = (change: CatalogueChange): (typeof CHANGE_OUTCOMES)[number] =>
  change.kind.endsWith('-added') ? 'added' : change.kind.endsWith('-removed') ? 'removed' : 'repriced'

/** Past this many parts a tally counts by section alone, so it stays one line. */
const TALLY_PARTS = 3

const counted = (count: number, section: ChangeSection) => countLabel(count, section.slice(0, -1).toLowerCase())

/**
 * An update's changes counted by section and outcome, `2 datasheets added · 1 upgrade added`,
 * or by section alone when that would run long, `38 datasheets · 17 detachments changed`.
 */
export function changeTally(changes: readonly CatalogueChange[]) {
  const inSection = (section: ChangeSection) => changes.filter((change) => changeSection(change) === section)
  const parts = CHANGE_SECTIONS.flatMap((section) =>
    CHANGE_OUTCOMES.flatMap((result) => {
      const count = inSection(section).filter((change) => changeOutcome(change) === result).length
      return count ? [`${counted(count, section)} ${result}`] : []
    }),
  )
  if (parts.length <= TALLY_PARTS) return parts
  const sections = CHANGE_SECTIONS.flatMap((section) => (inSection(section).length ? [counted(inSection(section).length, section)] : []))
  return sections.map((part, at) => (at === sections.length - 1 ? `${part} changed` : part))
}

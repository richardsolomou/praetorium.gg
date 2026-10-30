import type { FactionDatasheet } from '../../../../contracts/catalogue'
import { countBy } from '../../../../core/collections'
import type { NonMatchedPlayKind } from '../../../../core/name'

export type DatasheetSource = 'matched' | NonMatchedPlayKind

export const DATASHEET_SOURCES: { id: DatasheetSource; label: string; hint: string }[] = [
  { id: 'matched', label: 'Matched play', hint: 'Show matched play datasheets' },
  { id: 'legends', label: 'Legends', hint: 'Show Legends datasheets' },
  { id: 'crucible', label: 'Crucible', hint: 'Show Crucible datasheets' },
]

export const sourceOf = (unit: Pick<FactionDatasheet, 'nonMatchedPlay'>): DatasheetSource => unit.nonMatchedPlay ?? 'matched'

/**
 * The keywords worth narrowing a faction's list by, with how many datasheets carry each.
 *
 * A keyword every datasheet carries narrows nothing, and one only a single datasheet
 * carries is almost always that datasheet's own name, which search already finds.
 */
export function keywordOptions(units: readonly FactionDatasheet[]) {
  return [
    ...countBy(
      units.flatMap((unit) => [...new Set(unit.keywords)]),
      (keyword) => keyword,
    ),
  ]
    .filter(([, count]) => count > 1 && count < units.length)
    .map(([keyword, count]) => ({ keyword, count }))
    .toSorted((left, right) => left.keyword.localeCompare(right.keyword))
}

/** A datasheet must carry every chosen keyword, so each one narrows the list further. */
export function filterDatasheets<T extends FactionDatasheet>(
  units: readonly T[],
  { hidden, keywords, only }: { hidden: ReadonlySet<DatasheetSource>; keywords: ReadonlySet<string>; only: readonly ReadonlySet<string>[] },
) {
  return units.filter(
    (unit) =>
      !hidden.has(sourceOf(unit)) &&
      [...keywords].every((keyword) => unit.keywords.includes(keyword)) &&
      only.every((ids) => ids.has(unit.id)),
  )
}

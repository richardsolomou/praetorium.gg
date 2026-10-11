import type { RosterPick } from './roster'
import { currentCatalogueFamilyId, picksForRulesVersion } from './retiredCatalogueIds'

type PricedChoice = { key: string; kind?: 'enhancement' | 'upgrade' }
type PricedUnit = { choices: readonly PricedChoice[] }

export function picksAfterDetachmentChange<T extends RosterPick>(
  picks: readonly T[],
  units: readonly (PricedUnit | undefined)[],
  currentDetachmentIds: readonly string[],
  nextDetachmentIds: readonly string[],
): T[] {
  const current = new Set(currentDetachmentIds)
  const next = new Set(nextDetachmentIds)
  const changed = current.size !== next.size || [...current].some((id) => !next.has(id))
  const onlyAdded = next.size > current.size && [...current].every((id) => next.has(id))
  if (!changed || onlyAdded) return [...picks]

  return picks.map((pick, index) => {
    const special = new Set(units[index]?.choices.filter((choice) => choice.kind).map((choice) => choice.key) ?? [])
    if (!pick.choices || !special.size) return pick
    const choices = Object.fromEntries(Object.entries(pick.choices).filter(([key]) => !special.has(key)))
    return { ...pick, choices }
  })
}

export function picksAfterSetupChange<T extends RosterPick>(
  picks: readonly T[],
  units: readonly (PricedUnit | undefined)[],
  source: { catalogueId: string; detachmentIds: readonly string[] },
  next: { catalogueId: string; detachmentIds: readonly string[] },
): T[] {
  if (currentCatalogueFamilyId(source.catalogueId) !== currentCatalogueFamilyId(next.catalogueId)) return []
  if (source.catalogueId !== next.catalogueId) return picksForRulesVersion(picks, next.catalogueId)
  return picksAfterDetachmentChange(picks, units, source.detachmentIds, next.detachmentIds)
}

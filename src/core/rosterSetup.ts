import type { RosterPick, VsPick } from './roster'
import { currentCatalogueFamilyId, picksForRulesVersion } from './retiredCatalogueIds'

const withoutEnhancement = ({ enhancement: _enhancement, ...vs }: VsPick): VsPick => vs

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
    // A VS Data pick's Enhancement came from the Detachments it was built under.
    const kept = pick.vs?.enhancement ? { ...pick, vs: withoutEnhancement(pick.vs) } : pick
    if (!kept.choices || !special.size) return kept
    const choices = Object.fromEntries(Object.entries(kept.choices).filter(([key]) => !special.has(key)))
    return { ...kept, choices }
  })
}

export function picksAfterSetupChange<T extends RosterPick>(
  picks: readonly T[],
  units: readonly (PricedUnit | undefined)[],
  source: { catalogueId: string; detachmentIds: readonly string[] },
  next: { catalogueId: string; detachmentIds: readonly string[] },
): T[] {
  if (currentCatalogueFamilyId(source.catalogueId) !== currentCatalogueFamilyId(next.catalogueId)) return []
  if (source.catalogueId !== next.catalogueId) return picksForRulesVersion(picks, next.catalogueId, source.catalogueId)
  return picksAfterDetachmentChange(picks, units, source.detachmentIds, next.detachmentIds)
}

type ConvertedSetup = Pick<
  RosterSetupFields,
  | 'catalogueId'
  | 'detachmentIds'
  | 'disposition'
  | 'borrowedDetachmentId'
  | 'limit'
  | 'pointsBudget'
  | 'picks'
  | 'waivedRules'
  | 'optionalRules'
  | 'prep'
>
type RosterSetupFields = {
  catalogueId: string
  detachmentIds: readonly string[]
  disposition: string | null
  borrowedDetachmentId?: string | null
  limit: number
  pointsBudget?: number | null
  picks: readonly RosterPick[]
  waivedRules?: readonly string[]
  optionalRules?: readonly string[]
  prep: unknown
}

/** What a variant saved from a reviewed conversion takes from it; its name, access and group stay its own. */
export function convertedSetup<T extends RosterSetupFields>(setup: T): Pick<T, keyof ConvertedSetup> {
  const { catalogueId, detachmentIds, disposition, borrowedDetachmentId, limit, pointsBudget, picks, waivedRules, optionalRules, prep } =
    setup
  return { catalogueId, detachmentIds, disposition, borrowedDetachmentId, limit, pointsBudget, picks, waivedRules, optionalRules, prep }
}

import { attachedUnit } from '../core/attach'
import type { ModifierCache, Selection } from '../core/evaluate'
import { buildUnit, type RosterPick } from '../core/roster'
import type { UnitChoiceCache } from '../core/unitChoices'
import type { LoadedCatalogue } from './catalogueIndex'
import { rosterDetachments } from './rosterDetachments'

/** One pick built the way the roster around it builds it. */
export function buildRosterPick(
  loaded: LoadedCatalogue,
  catalogueId: string,
  detachments: readonly Selection[],
  pick: RosterPick,
  choiceCache?: UnitChoiceCache,
  modifierCache?: ModifierCache,
) {
  return buildUnit(pick.entryId, loaded.index, pick.models, pick.choices, {
    primaryCatalogueId: catalogueId,
    roster: detachments,
    spreads: pick.spreads,
    toggles: pick.toggles,
    choiceCache,
    modifierCache,
  })
}

export function rosterDatasheetSelections(
  loaded: LoadedCatalogue,
  data: {
    catalogueId: string
    detachmentIds: string[]
    picks: RosterPick[]
  },
) {
  const detachments = rosterDetachments(loaded, data.catalogueId, data.detachmentIds).selections
  const builtUnits = data.picks.flatMap((pick, index) => {
    const unit = buildRosterPick(loaded, data.catalogueId, detachments, pick)
    return unit ? [{ index, selection: unit.selection, models: unit.size.models }] : []
  })
  return {
    selections: [...detachments, ...builtUnits.map((unit) => unit.selection)],
    unitSelections: builtUnits.map((unit, at) => ({
      pickIndex: unit.index,
      selectionIndex: detachments.length + at,
      models: unit.models,
    })),
  }
}

export function rosterDatasheetContext(
  loaded: LoadedCatalogue,
  data: Parameters<typeof rosterDatasheetSelections>[1] & { pickIndex: number | null },
  prepared?: ReturnType<typeof rosterDatasheetSelections>,
) {
  if (data.pickIndex === null) return undefined
  const roster = prepared ?? rosterDatasheetSelections(loaded, data)
  const selected = roster.unitSelections.find((unit) => unit.pickIndex === data.pickIndex)
  if (!selected) return undefined
  const attached = attachedUnit(data.picks, data.pickIndex)
  return {
    ...roster,
    unitSelectionIndex: selected.selectionIndex,
    companions: roster.unitSelections.flatMap((unit) => (attached.includes(unit.pickIndex) ? [unit.selectionIndex] : [])),
  }
}

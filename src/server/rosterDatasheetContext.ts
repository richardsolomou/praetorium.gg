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

export function rosterDatasheetContext(
  loaded: LoadedCatalogue,
  data: {
    catalogueId: string
    detachmentIds: string[]
    picks: RosterPick[]
    pickIndex: number | null
  },
) {
  // A catalogue preview is not a roster selection. Without an index there is no
  // selected unit to receive contextual modifiers, so expanding the roster would
  // be work whose result is immediately discarded.
  if (data.pickIndex === null) return undefined
  const detachments = rosterDetachments(loaded, data.catalogueId, data.detachmentIds).selections
  const builtUnits = data.picks.flatMap((pick, index) => {
    const unit = buildRosterPick(loaded, data.catalogueId, detachments, pick)
    return unit ? [{ index, selection: unit.selection, models: unit.size.models }] : []
  })
  const selected = builtUnits.findIndex((unit) => unit.index === data.pickIndex)
  const selections = [...detachments, ...builtUnits.map((unit) => unit.selection)]
  // A character, the unit it joined and everything else joined to that unit are
  // one unit, so each is told about the others: a relic that speaks of the
  // bearer's unit has to reach every model in it.
  const attached = attachedUnit(data.picks, data.pickIndex)
  const companions = builtUnits.flatMap((unit, at) => (attached.includes(unit.index) ? [detachments.length + at] : []))
  return selected < 0
    ? undefined
    : {
        selections,
        unitSelectionIndex: detachments.length + selected,
        companions,
        unitSelections: builtUnits.map((unit, at) => ({
          pickIndex: unit.index,
          selectionIndex: detachments.length + at,
          models: unit.models,
        })),
      }
}

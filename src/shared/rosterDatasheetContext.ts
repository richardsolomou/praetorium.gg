import { attachedUnit } from '../core/attachedUnits'
import type { Selection } from '../core/evaluate'
import { catalogueTreeOf, type RosterPick } from '../core/roster'
import type { VsBuiltUnit } from '../core/vsDataBuild'
import type { LoadedCatalogue } from './catalogueIndex'
import { rosterDetachments } from './rosterDetachments'
import { buildPick } from './vsDataBuild'

/**
 * One pick built the way the roster around it builds it. A VS pick's tree here is the catalogue's build of it
 * (`buildVsUnit`), so what reads the tree, as the simulator, the loadout search and the BattleScribe export do, reads its
 * catalogue choices and its size until each reads VS Data's.
 */
export function buildRosterPick(
  loaded: LoadedCatalogue,
  catalogueId: string,
  detachments: readonly Selection[],
  pick: RosterPick,
  detachmentIds: readonly string[] = [],
) {
  return buildPick(loaded, pick, { catalogueId, detachmentIds }, { primaryCatalogueId: catalogueId, roster: detachments })
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
    const unit = buildRosterPick(loaded, data.catalogueId, detachments, pick, data.detachmentIds)
    if (!unit) return []
    // A VS pick is sized by its `vs`, so only a catalogue build can be asked for a size it does not field.
    const refused = !unit.vs && pick.models !== undefined && pick.models !== unit.size.models ? pick.models : undefined
    return [{ index, selection: catalogueTreeOf(unit), models: unit.size.models, refused, vs: unit.vs }]
  })
  const vsUnits: Record<number, VsBuiltUnit> = {}
  for (const unit of builtUnits) if (unit.vs) vsUnits[unit.index] = unit.vs
  return {
    selections: [...detachments, ...builtUnits.map((unit) => unit.selection)],
    /** Each VS pick by its index in the list, as VS Data fields it: its roster unit, size, models, carriers and wargear. */
    vsUnits,
    unitSelections: builtUnits.map((unit, at) => ({
      pickIndex: unit.index,
      selectionIndex: detachments.length + at,
      models: unit.models,
      ...(unit.refused === undefined ? {} : { refusedModels: unit.refused }),
      // A VS pick's models carry what VS Data fields, which its catalogue tree, built at its default loadout, does not.
      ...(unit.vs ? { carriers: unit.vs.carriers } : {}),
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

import type { RosterPick } from '../core/roster'
import type { LoadedCatalogue } from './catalogueIndex'
import type { LoadedRules } from './rules'
import { rosterDatasheetContext } from './rosterDatasheetContext'
import { datasheetViewsIn, datasheetIn } from './catalogue'
import { describeDatasheetAbilities } from './datasheetDescriptions'
import { datacardJoinOutcome } from './datasheetJoin'

export function rosterLoadoutDatasheets(
  loaded: LoadedCatalogue,
  data: {
    catalogueId: string
    entryId: string
    detachmentIds: string[]
    picks: RosterPick[]
    pickIndex: number | null
  },
  rules: LoadedRules | null,
) {
  const context = rosterDatasheetContext(loaded, data)
  const views = context ? datasheetViewsIn(loaded, data.catalogueId, data.entryId, context) : null
  return {
    datacardJoin: datacardJoinOutcome(loaded, data.catalogueId, data.entryId),
    controlledChoices: views?.controlledChoices ?? [],
    carriers: views?.carriers ?? [],
    selected: views
      ? describeDatasheetAbilities(loaded, data.catalogueId, views.selected, rules)
      : rosterDatasheet(loaded, data, undefined, false, rules),
    available: views
      ? describeDatasheetAbilities(loaded, data.catalogueId, views.available, rules)
      : rosterDatasheet(loaded, data, undefined, true, rules),
  }
}

export function rosterDatasheet(
  loaded: LoadedCatalogue,
  data: { catalogueId: string; entryId: string; detachmentIds?: string[] },
  context: ReturnType<typeof rosterDatasheetContext>,
  everyWeapon: boolean,
  rules: LoadedRules | null,
) {
  return describeDatasheetAbilities(
    loaded,
    data.catalogueId,
    datasheetIn(loaded, data.catalogueId, data.entryId, context ? { ...context, everyWeapon } : undefined),
    rules,
  )
}

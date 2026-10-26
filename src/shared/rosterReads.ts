import type { RosterPick } from '../core/roster'
import type { LoadedCatalogue } from './catalogueIndex'
import type { LoadedRules } from './rules'
import { rosterDatasheetContext } from './rosterDatasheetContext'
import { datasheetViewsIn, datasheetIn } from './catalogue'
import { describeDatasheetAbilities } from './datasheetDescriptions'
import { datacardOf } from './datasheetJoin'

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
  // With no roster context everyWeapon changes nothing, so both views are one read.
  const alone = views ? null : rosterDatasheet(loaded, data, undefined, false, rules)
  return {
    datacardJoin: datacardOf(loaded, data.catalogueId, data.entryId) ? ('name' as const) : ('missing' as const),
    carriers: views?.carriers ?? [],
    selected: views ? describeDatasheetAbilities(loaded, data.catalogueId, views.selected, rules) : alone,
    available: views ? describeDatasheetAbilities(loaded, data.catalogueId, views.available, rules) : alone,
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

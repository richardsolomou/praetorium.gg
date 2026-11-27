import { remember } from '../core/collections'
import { buildUnit, type BuiltUnit, buildVsUnit, type RosterPick } from '../core/roster'
import type { ChoiceOptions } from '../core/unitChoices'
import { type VsDataDefinitions, vsDataDefinitions } from '../core/vsDataConstruction'
import { priceVsRoster, unitKeywords, type VsRoster } from '../core/vsDataRoster'
import type { LoadedCatalogue } from './catalogueIndex'

const definitionsOf = new WeakMap<LoadedCatalogue, VsDataDefinitions | null>()

/** The current rules version's VS Data roster definitions, options and wargear included; null where VS Data checks none. */
export const vsDefinitionsOf = (loaded: LoadedCatalogue): VsDataDefinitions | null =>
  remember(definitionsOf, loaded, () => (loaded.vsRoster ? vsDataDefinitions(loaded.vsRoster.construction) : null))

/** The VS Data unit a datasheet entry is, where VS Data defines it in the current rules version and checks it. */
export function vsUnitIdOf(loaded: LoadedCatalogue, entryId: string): string | undefined {
  const id = loaded.vsRoster?.units[entryId]
  const definitions = vsDefinitionsOf(loaded)
  return id && definitions?.get('unit', id) && !definitions.unavailable.has(id) && definitions.modelsOf(id).length ? id : undefined
}

/** The VS Data IDs a list of `catalogueId` with `detachmentIds` reads as, the IDs VS Data does not know left out. */
function vsListOf(loaded: LoadedCatalogue, catalogueId: string, detachmentIds: readonly string[]) {
  const data = loaded.vsRoster
  return {
    faction: data?.books[catalogueId.slice(catalogueId.indexOf('~') + 1)],
    detachments: detachmentIds.flatMap((id) => data?.detachments[id] ?? []),
  }
}

/**
 * One pick built the way its roster builds it: a VS pick by VS Data's definitions beside the catalogue's tree of it
 * (`buildVsUnit`), any other pick, and a VS pick of a datasheet VS Data does not define here, by the catalogue alone.
 */
export function buildPick(
  loaded: LoadedCatalogue,
  pick: RosterPick,
  list: { catalogueId: string; detachmentIds: readonly string[] },
  context: ChoiceOptions,
): BuiltUnit | null {
  const definitions = vsDefinitionsOf(loaded)
  const unit = pick.vs && vsUnitIdOf(loaded, pick.entryId)
  if (pick.vs && definitions && unit) {
    const { detachments } = vsListOf(loaded, list.catalogueId, list.detachmentIds)
    const filed = Object.entries(loaded.vsRoster?.enhancements ?? {}).find(
      ([key, id]) => id === pick.vs!.enhancement && detachments.includes(key.slice(0, key.indexOf('/'))),
    )
    return buildVsUnit(
      { ...pick, vs: pick.vs },
      loaded.index,
      {
        definitions,
        unit,
        ...(filed ? { enhancementOption: filed[0].slice(filed[0].indexOf('/') + 1) } : {}),
      },
      context,
    )
  }
  return buildUnit(pick.entryId, loaded.index, pick.models, pick.choices, {
    ...context,
    spreads: pick.spreads,
    toggles: pick.toggles,
    floor: pick.floor,
  })
}

/** The list as VS Data's roster reads it, its VS picks fielded by their own selections and every other unit by its ID. */
function vsRosterOf(
  loaded: LoadedCatalogue,
  definitions: VsDataDefinitions,
  list: { catalogueId: string; detachmentIds: readonly string[]; limit: number },
  units: readonly { entryId: string; vs?: BuiltUnit['vs'] }[],
) {
  const { faction, detachments } = vsListOf(loaded, list.catalogueId, list.detachmentIds)
  const battleSize = definitions.all('battle-size').find((size) => size.data.points === list.limit)?.id
  // Where each unit sits in the VS roster; a unit VS Data does not know has no place, though it still counts in the list.
  const at = new Map<number, number>()
  const read: VsRoster['units'] = []
  units.forEach((unit, position) => {
    const id = unit.vs?.unit.unit ?? loaded.vsRoster?.units[unit.entryId]
    if (!id) return
    at.set(position, read.length)
    read.push(unit.vs?.unit ?? { unit: id })
  })
  const roster: VsRoster = { faction: faction ?? '', detachments, ...(battleSize ? { battleSize } : {}), units: read }
  return { roster, at }
}

/**
 * What each VS pick costs under VS Data's points, by its position in `units`, copies of a datasheet counted across the
 * whole list as the field manual counts them. A pick VS Data leaves any part of unpriced has no price here.
 */
export function vsPickPrices(
  loaded: LoadedCatalogue,
  list: { catalogueId: string; detachmentIds: readonly string[]; limit: number },
  units: readonly { entryId: string; vs?: BuiltUnit['vs'] }[],
): Map<number, number> {
  const definitions = vsDefinitionsOf(loaded)
  if (!definitions || !units.some((unit) => unit.vs)) return new Map()
  const { roster, at } = vsRosterOf(loaded, definitions, list, units)
  const price = priceVsRoster(definitions, roster)
  return new Map(
    units.flatMap((unit, position) => {
      const place = at.get(position)
      const priced = place === undefined ? undefined : price.units[place]
      return unit.vs && priced && !priced.unpriced.length ? [[position, priced.points] as const] : []
    }),
  )
}

/** A VS pick's keywords in its list: its datasheet's and each conditional one the list or its allegiance gives it. */
export function vsPickKeywords(
  loaded: LoadedCatalogue,
  list: { catalogueId: string; detachmentIds: readonly string[]; limit: number },
  units: readonly { entryId: string; vs?: BuiltUnit['vs'] }[],
  position: number,
): string[] | null {
  const definitions = vsDefinitionsOf(loaded)
  const built = units[position]?.vs
  const unit = built && definitions?.get('unit', built.unit.unit)
  if (!definitions || !built || !unit) return null
  // VS Data writes keywords in capitals; a list shows them as the catalogue does, each word capitalised.
  return unitKeywords(unit.data, vsRosterOf(loaded, definitions, list, units).roster, built.unit.allegiance).map((keyword) =>
    keyword.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, before: string, letter: string) => before + letter.toUpperCase()),
  )
}

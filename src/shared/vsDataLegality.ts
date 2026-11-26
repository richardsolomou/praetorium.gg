import { type VsDataConstruction, type VsDataDefinitions, vsDataDefinitions } from '../core/vsDataConstruction'
import { nonMatchedPlayKind } from '../core/name'
import { checkVsRoster, enhancementAdmits, unitKeywords, type VsProblem, type VsRosterUnit } from '../core/vsDataRoster'
import { hasWarlordToggle, type UnitChoice, type UnitToggle } from '../core/unitChoices'
import { remember } from '../core/collections'
import { idsIn, type VsDataIds } from './vsDataPoints'

/**
 * A rules version's VS Data roster definitions without wargear, and the IDs its saved lists hold read as VS Data's: each
 * book's faction, each Detachment, each Enhancement option under its VS Data Detachment, and each datasheet VS Data
 * checks. A Warhammer Legends datasheet stays with the catalogue's checks, as with its price.
 */
export type VsRosterData = {
  construction: VsDataConstruction
  books: Record<string, string>
  detachments: Record<string, string>
  units: Record<string, string>
  enhancements: Record<string, string>
}

export function vsRosterData(
  construction: VsDataConstruction,
  ids: VsDataIds,
  edition: string | null,
  nameOf: (id: string) => string | undefined,
): VsRosterData {
  const definitions = vsDataDefinitions(construction)
  const units: Record<string, string> = {}
  for (const [entryId, id] of idsIn(ids.units, edition)) {
    const unit = definitions.get('unit', id)
    const name = nameOf(entryId)
    if (!name || nonMatchedPlayKind(name) === 'legends' || unit?.data.legends) continue
    if (unit || definitions.unavailable.has(id)) units[entryId] = id
  }
  return {
    construction,
    books: Object.fromEntries(idsIn(ids.books, edition)),
    detachments: Object.fromEntries(idsIn(ids.detachments, edition)),
    units,
    enhancements: Object.fromEntries(idsIn(ids.enhancements, edition)),
  }
}

const definitionsOf = new WeakMap<VsRosterData, VsDataDefinitions>()

/** A unit as the list holds it: its datasheet, size, Warlord toggle and the options its choices take. */
export type CheckedUnit = {
  key: number
  entryId: string
  name: string
  size: { models: number; min: number; max: number }
  toggles: readonly Pick<UnitToggle, 'name' | 'selected'>[]
  /** The unit's keywords as the catalogue reads them in the list. */
  keywords: readonly string[]
  choices: readonly Pick<UnitChoice, 'name' | 'options'>[]
}

export type VsDataError = { entryId: string; entryName: string; message: string }

/**
 * What VS Data's checker finds wrong with a list beyond its units' wargear, which the catalogue still builds: allies,
 * exclusions, copies, unit limits, sizes, Enhancements, Warlord, allegiances and Detachment groups. Null where VS Data
 * cannot place the list, which leaves it to the catalogue's checks.
 */
export function vsDataErrors(
  data: VsRosterData | undefined,
  list: { catalogueId: string; detachmentIds: readonly string[]; limit: number },
  units: readonly CheckedUnit[],
): VsDataError[] | null {
  if (!data) return null
  const definitions = remember(definitionsOf, data, () => vsDataDefinitions(data.construction))
  const faction = data.books[list.catalogueId.slice(list.catalogueId.indexOf('~') + 1)]
  const detachments = list.detachmentIds.map((id) => data.detachments[id])
  const own = new Set([faction, definitions.get('faction', faction ?? '')?.data.parent])
  // A list VS Data cannot place stays with the catalogue's checks: one with no Detachment, as a battle imported from
  // another app is, or with a Detachment VS Data files under another faction, as a chapter's Deathwatch Support is, until
  // VS Data records it.
  if (!faction || !detachments.length || detachments.some((id) => !id || !own.has(definitions.get('detachment', id)?.data.faction)))
    return null
  const battleSize = definitions.all('battle-size').find((size) => size.data.points === list.limit)?.id
  const taken = new Set<string>()
  const checked = units.flatMap((unit): { unit: CheckedUnit; read: VsRosterUnit; offersAllegiance: boolean }[] => {
    const id = data.units[unit.entryId]
    if (!id) return []
    // A unit whose size the player cannot change is fielded as the catalogue models it, which can count a model VS Data
    // folds into another, so only a size the player chose is checked.
    const size = unit.size.max > unit.size.min ? unit.size.models : (definitions.get('unit', id)?.data.sizes[0] ?? unit.size.models)
    const read: VsRosterUnit = { unit: id, size }
    const allegiances = new Map(
      (definitions.get('unit', id)?.data.allegiances ?? []).flatMap((offer) =>
        offer.choices.map((choice) => [same(definitions.get('allegiance', choice)?.name ?? choice), choice] as const),
      ),
    )
    for (const choice of unit.choices)
      for (const option of choice.options.filter((candidate) => candidate.count > 0)) {
        const allegiance = [...allegiances].find(([name]) => same(option.name) === name || same(option.name).endsWith(name))?.[1]
        if (allegiance) {
          read.allegiance ??= allegiance
          continue
        }
        // One catalogue option can stand for a same-named Enhancement of each of the list's Detachments; each copy taken
        // is a different Detachment's while one is left.
        const offered = detachments.flatMap((detachment) => data.enhancements[`${detachment}/${option.id}`] ?? [])
        const enhancement = offered.find((candidate) => !taken.has(candidate)) ?? offered[0]
        if (enhancement && !read.enhancement) {
          read.enhancement = enhancement
          taken.add(enhancement)
        }
      }
    // The builder offers a unit only the catalogue's options, so an allegiance none of them names cannot be asked of it.
    const offersAllegiance = unit.choices.some((choice) =>
      choice.options.some((option) =>
        [...allegiances.keys()].some((name) => same(option.name) === name || same(option.name).endsWith(name)),
      ),
    )
    if (hasWarlordToggle(unit.toggles)) {
      const models = definitions.modelsOf(id)
      read.warlord = (models.find((model) => model.data.max === 1) ?? models[0])?.id
    }
    return [{ unit, read, offersAllegiance }]
  })
  const roster = {
    faction,
    detachments: detachments as string[],
    ...(battleSize ? { battleSize } : {}),
    units: checked.map(({ read }) => read),
  }
  // VS Data leaves CHARACTER off some units whose models the app makes Characters (Company Heroes, a Ravenwing Command
  // Squad); where the catalogue says the unit is a Character, its Enhancements and Warlord are not refused for that.
  const character = (at: number | undefined) => {
    const found = checked[at ?? -1]
    return (
      Boolean(found?.unit.keywords.some((keyword) => keyword.toUpperCase() === 'CHARACTER')) &&
      !definitions.get('unit', found!.read.unit)?.data.keywords.some((keyword) => keyword.toUpperCase() === 'CHARACTER')
    )
  }
  const unpriced = { units: [], points: 0, detachmentPoints: 0, unpriced: [] }
  return checkVsRoster(definitions, roster, unpriced)
    .filter((problem) => problem.code !== 'allegiance-missing' || checked[problem.unit ?? -1]?.offersAllegiance)
    .filter((problem) => {
      if (!character(problem.unit)) return true
      const { read } = checked[problem.unit!]!
      if (problem.code === 'warlord-ineligible') return false
      if (problem.code !== 'enhancement-keywords' || !read.enhancement) return true
      // Refused only for what the missing keyword does not explain.
      const enhancement = definitions.get('enhancement', read.enhancement)
      const keywords = [...unitKeywords(definitions.get('unit', read.unit)!.data, roster, read.allegiance), 'CHARACTER']
      return !enhancement || !enhancementAdmits(definitions, enhancement, read, keywords)
    })
    .flatMap((problem) => described(problem, checked, definitions) ?? [])
}

/** Names compared by their letters and digits alone, without the "upgrade" BSData adds to some (Character upgrade). */
const same = (name: string) =>
  name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/\bupgrade$/, '')
    .replace(/[^a-z0-9]/g, '')

/** A problem in a player's words; null for what the catalogue's checks or the format rules already say. */
function described(problem: VsProblem, checked: { unit: CheckedUnit }[], definitions: VsDataDefinitions): VsDataError | null {
  const unit = problem.unit === undefined ? undefined : checked[problem.unit]?.unit
  const owner = unit ? { entryId: unit.entryId, entryName: unit.name } : { entryId: 'army', entryName: 'Army' }
  const named = (text: string) =>
    text.replace(/(?:detachment|unit|model|allegiance|wargear|enhancement):([\w.-]+)/g, (_, id: string) => {
      for (const kind of ['detachment', 'unit', 'model', 'allegiance', 'wargear'] as const) {
        const found = definitions.get(kind, id)
        if (found) return found.name
      }
      return id
    })
  const message: Partial<Record<VsProblem['code'], string>> = {
    'not-current': 'is not in this rules version',
    'detachment-faction': named(problem.message.replace(/ is not a .* detachment$/, ' cannot be taken by this army')),
    'detachment-count': 'needs one to three Detachments',
    'detachment-group': named(problem.message.replace(/^(.*) shares (\S+) with (.*)$/, '$1 cannot be taken with $3, as both are $2')),
    'unit-faction': 'cannot be taken by this army',
    'unit-excluded': 'cannot be taken with this army or its Detachments',
    'ally-detachment': named(problem.message.replace(/^.*? needs one of/, 'needs one of these Detachments:')),
    'ally-points': named(problem.message),
    'ally-limit': named(
      problem.message.replace(
        /^a roster holds at most (\d+) allied (.+) units, has (\d+)$/,
        'holds $3 allied $2 units, more than the $1 its battle size allows',
      ),
    ),
    'ally-enhancement': 'cannot take Enhancements as an allied unit',
    'unit-size': named(problem.message.replace(/^.*? fields/, 'fields')),
    'roster-limit': named(problem.message.replace(/^.*? is limited/, 'is limited')),
    'unit-limit': named(problem.message),
    'enhancement-detachment': named(problem.message),
    'enhancement-keywords': named(problem.message.replace(/^.*? cannot take/, 'cannot take')),
    'enhancement-repeated': named(problem.message),
    'enhancement-limit': named(problem.message),
    'warlord-ineligible': 'cannot be the Warlord',
    'warlord-required': named(problem.message),
    'allegiance-missing': 'needs an allegiance',
    'allegiance-choice': named(problem.message.replace(/^.*? cannot take/, 'cannot take')),
    'allegiance-requires': named(problem.message),
    'allegiance-limit': named(problem.message),
  }
  const text = message[problem.code]
  return text ? { ...owner, message: text } : null
}

/** The catalogue options a list's Detachments offer as VS Data Enhancements, whose limits VS Data's checker then says. */
export function vsDataEnhancementOptions(data: VsRosterData | undefined, detachmentIds: readonly string[]) {
  const detachments = new Set(detachmentIds.map((id) => data?.detachments[id]))
  return new Set(
    Object.keys(data?.enhancements ?? {}).flatMap((key) => {
      const [detachment, option] = key.split('/') as [string, string]
      return detachments.has(detachment) ? [option] : []
    }),
  )
}

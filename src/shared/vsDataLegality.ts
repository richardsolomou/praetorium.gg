import { type VsDataConstruction, type VsDataDefinitions, vsDataDefinitions } from '../core/vsDataConstruction'
import { checkVsRoster, checkVsUnit, type VsProblem, type VsRosterUnit } from '../core/vsDataRoster'
import type { VsPick } from '../core/roster'
import { hasWarlordToggle, type UnitChoice, type UnitToggle } from '../core/unitChoices'
import { remember } from '../core/collections'
import { nonMatchedPlayKind } from '../core/name'
import { idsIn, type VsDataIds } from './vsDataPoints'

/**
 * A rules version's VS Data roster definitions without wargear, and the IDs its saved lists hold read as VS Data's: each
 * book's faction, each Detachment, each Enhancement option under its VS Data Detachment, and each datasheet VS Data
 * checks.
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
  for (const [entryId, saved] of idsIn(ids.units, edition)) {
    const id = definitions.current(saved)
    if (nameOf(entryId) && (definitions.get('unit', id) || definitions.unavailable.has(id))) units[entryId] = id
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
  /** The unit by VS Data IDs, which VS Data checks whole, models and wargear included, instead of reading its choices. */
  vs?: VsPick
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
  if (!faction) return null
  const without = definitions.get('faction', faction)?.data.withoutDetachments
  // A faction that takes no Detachment, as a Titan army does, refuses any it holds, VS Data's or not.
  const detachments = list.detachmentIds.map((id) => data.detachments[id] ?? (without ? `unknown:${id}` : undefined))
  const own = new Set([faction, definitions.get('faction', faction)?.data.parent])
  // A list VS Data cannot place stays with the catalogue's checks: one of a faction with neither Detachments of its own
  // nor `withoutDetachments`, or with a Detachment VS Data does not file under its faction. Any other list needs one.
  const ownsDetachments = definitions.all('detachment').some((detachment) => own.has(detachment.data.faction))
  // Nor can it place one of a faction none of whose datasheets reads as its own, as Titanicus Traitoris's read as the
  // Imperial Titans they share BSData IDs with.
  if (!readsAsOwn(data, definitions, own)) return null
  if (!without && (!ownsDetachments || detachments.some((id) => !id || !own.has(definitions.get('detachment', id)?.data.faction))))
    return null
  const battleSize = definitions.all('battle-size').find((size) => size.data.points === list.limit)?.id
  const taken = new Set<string>()
  const checked = units.flatMap((unit): { unit: CheckedUnit; read: VsRosterUnit; offersAllegiance: boolean }[] => {
    const id = vsDataChecks(data, list.catalogueId, unit)
    if (!id) return []
    if (unit.vs) {
      if (unit.vs.enhancement) taken.add(unit.vs.enhancement)
      return [{ unit, read: { unit: id, ...unit.vs }, offersAllegiance: true }]
    }
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
      // The Warlord is the unit's Character model, as a Company Heroes' Ancient is, else its one model of a kind.
      const models = definitions.modelsOf(id)
      read.warlord = (
        models.find((model) => model.data.keywords?.some((keyword) => keyword.toUpperCase() === 'CHARACTER')) ??
        models.find((model) => model.data.max === 1) ??
        models[0]
      )?.id
    }
    return [{ unit, read, offersAllegiance }]
  })
  const roster = {
    faction,
    detachments: detachments as string[],
    ...(battleSize ? { battleSize } : {}),
    units: checked.map(({ read }) => read),
  }
  const unpriced = { units: [], points: 0, detachmentPoints: 0, unpriced: [] }
  return (
    checkVsRoster(definitions, roster, unpriced)
      .filter((problem) => problem.code !== 'allegiance-missing' || checked[problem.unit ?? -1]?.offersAllegiance)
      // Saying it takes no Detachment says each one it holds is not its own.
      .filter((problem) => !without || problem.code !== 'detachment-faction')
      .flatMap((problem) => described(problem, checked, definitions) ?? [])
  )
}

const ownedFactions = new WeakMap<VsRosterData, Set<string>>()
const readsAsOwn = (data: VsRosterData, definitions: VsDataDefinitions, own: ReadonlySet<string | undefined>) => {
  const factions = remember(
    ownedFactions,
    data,
    () => new Set(Object.values(data.units).flatMap((id) => definitions.get('unit', id)?.data.faction ?? [])),
  )
  return [...own].some((faction) => faction !== undefined && factions.has(faction))
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
    text.replace(/(?:detachment|unit|model|allegiance|wargear|enhancement|roster-option):([\w.-]+)/g, (_, id: string) => {
      for (const kind of ['detachment', 'unit', 'model', 'allegiance', 'wargear', 'roster-option'] as const) {
        const found = definitions.get(kind, id)
        if (found) return found.name
      }
      return id
    })
  const message: Partial<Record<VsProblem['code'], string>> = {
    'not-current': 'is not in this rules version',
    'detachment-faction': named(problem.message.replace(/ is not a .* detachment$/, ' cannot be taken by this army')),
    'detachment-count': problem.message.includes('no detachments') ? 'takes no Detachment' : 'needs one to three Detachments',
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
  const text = unit ? (message[problem.code] ?? unitWords(problem, named)) : message[problem.code]
  return text ? { ...owner, message: text } : null
}

/** The bound a count breaks, as a player reads it. */
const bound = (min: string, max: string, has: string) =>
  min === max ? min : Number(has) > Number(max) ? `at most ${max}` : `at least ${min}`
/** A list of names, the last joined by `word`. */
const joined = (names: string, word: string) => names.replace(/, (?=[^,]*$)/, ` ${word} `)
const plural = (count: string, noun: string) => `${noun}${/(^| )1$/.test(count) ? '' : 's'}`

/** A problem with a unit's own models or wargear, which VS Data checks for a unit fielded by its IDs. */
function unitWords(problem: VsProblem, named: (text: string) => string): string | undefined {
  const text = named(problem.message)
  const words = (pattern: RegExp, say: (...parts: string[]) => string) => {
    const parts = pattern.exec(text)
    return parts ? say(...parts.slice(1)) : undefined
  }
  switch (problem.code) {
    case 'model-count':
      return words(/^(.+) needs (\d+)-(\d+) models, has (-?\d+)$/, (model, min, max, has) => {
        const allowed = bound(min, max, has)
        return `fields ${allowed} ${model} ${plural(allowed, 'model')}, has ${has}`
      })
    case 'model-group-count':
      return words(/^(.+) together need (\d+)-(\d+) models, have (\d+)$/, (models, min, max, has) => {
        const allowed = bound(min, max, has)
        return `fields ${allowed} ${joined(models, 'and')} ${plural(allowed, 'model')} together, has ${has}`
      })
    case 'unit-composition':
      return 'fields its models in a mix its datasheet does not allow'
    case 'option-count':
      return words(
        /^(.+) takes (\d+)-(\d+), has (\d+)$/,
        (option, min, max, has) => `takes ${bound(min, max, has)} from ${option}, has ${has}`,
      )
    case 'option-uniform':
      return words(/^(.+) is taken (\d+) times .*$/, (option, max) => `takes ${option} ${max} times with one choice, or not at all`)
    case 'option-cap':
      return words(
        /^.+ takes at most (\d+) of (.+), has (\d+)$/,
        (max, wargear, has) => `takes at most ${max} ${joined(wargear, 'or')}, has ${has}`,
      )
    case 'option-unavailable':
      return words(/^(.+) needs one of (.+) from .+$/, (option, wargear) => `needs ${joined(wargear, 'or')} to take ${option}`)
    case 'option-group-count':
      return words(
        /^(.+) together take (at most|at least) (\d+), have (\d+)$/,
        (options, side, n, has) => `takes ${side} ${n} from ${joined(options, 'and')} together, has ${has}`,
      )
    // IDs the unit's datasheet no longer holds, as a saved choice the builder can no longer offer.
    case 'missing-definition':
    case 'unit-model':
    case 'unit-option':
    case 'option-choice':
    case 'option-quantity':
      return 'a saved choice is no longer available; reselect this unit’s options'
    default:
      return undefined
  }
}

/**
 * What is wrong with the models and wargear of each unit the list fields by VS Data IDs, for a list VS Data cannot place,
 * whose roster the catalogue checks instead.
 */
export function vsPickErrors(data: VsRosterData | undefined, units: readonly CheckedUnit[]): VsDataError[] {
  if (!data) return []
  const definitions = remember(definitionsOf, data, () => vsDataDefinitions(data.construction))
  return units.flatMap((unit) => {
    const id = data.units[unit.entryId]
    if (!unit.vs || !id) return []
    const problems: VsProblem[] = []
    checkVsUnit(definitions, { unit: id, ...unit.vs }, (code, message) => problems.push({ code, unit: 0, message }))
    return problems.flatMap((problem) => described(problem, [{ unit }], definitions) ?? [])
  })
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

/**
 * The VS Data unit a list's datasheet is checked as, or undefined where the catalogue checks it: a datasheet VS Data
 * defines no unit for, or a Warhammer Legends one it files under a faction the army neither is nor allies with, as it
 * does a fortification or an Aeldari Legends hero, until VS Data offers it there.
 */
export function vsDataChecks(
  data: VsRosterData | undefined,
  catalogueId: string,
  unit: Pick<CheckedUnit, 'entryId' | 'name'>,
): string | undefined {
  const id = data?.units[unit.entryId]
  if (!data || !id) return undefined
  const definitions = remember(definitionsOf, data, () => vsDataDefinitions(data.construction))
  const filed = definitions.get('unit', id)?.data
  const faction = data.books[catalogueId.slice(catalogueId.indexOf('~') + 1)]
  const army = faction ? definitions.get('faction', faction)?.data : undefined
  const own = new Set([faction, army?.parent])
  const legends = Boolean(filed?.legends) || nonMatchedPlayKind(unit.name) === 'legends'
  const offered = own.has(filed?.faction) || (army?.allies ?? []).some((ally) => ally.units.includes(id))
  return filed && legends && !offered ? undefined : id
}

/** The force dispositions of a list whose faction takes no Detachment, by their slugs; null for any other faction. */
export function vsDataWithoutDetachments(data: VsRosterData | undefined, catalogueId: string): string[] | null {
  if (!data) return null
  const faction = data.books[catalogueId.slice(catalogueId.indexOf('~') + 1)]
  const definitions = remember(definitionsOf, data, () => vsDataDefinitions(data.construction))
  const without = faction ? definitions.get('faction', faction)?.data.withoutDetachments : undefined
  return without ? (without.dispositions ?? []).map((id) => id.slice(id.lastIndexOf('.') + 1)) : null
}

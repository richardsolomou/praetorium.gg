import { type VsDataConstruction, type VsDataDefinitions, vsDataDefinitions } from '../core/vsDataConstruction'
import { checkVsRoster, type VsProblem, type VsRosterUnit } from '../core/vsDataRoster'
import { hasWarlordToggle, type UnitChoice, type UnitToggle } from '../core/unitChoices'
import { remember } from '../core/collections'
import { isNonMatchedPlayName } from '../core/name'
import { datasheetOf, idsIn, inBook, type VsDataIds } from './vsDataPoints'

/**
 * A rules version's VS Data roster definitions, and the IDs its saved lists hold read as VS Data's: each
 * book's faction, each Detachment, each Enhancement option under its VS Data Detachment, and each datasheet VS Data
 * checks, under its book where it is another unit there (`inBook`), null where VS Data defines no such unit.
 */
export type VsRosterData = {
  construction: VsDataConstruction
  books: Record<string, string>
  detachments: Record<string, string>
  units: Record<string, string | null>
  enhancements: Record<string, string>
}

export function vsRosterData(
  construction: VsDataConstruction,
  ids: VsDataIds,
  edition: string | null,
  nameOf: (id: string) => string | undefined,
): VsRosterData {
  const definitions = vsDataDefinitions(construction)
  const units: VsRosterData['units'] = {}
  for (const [entryId, saved] of idsIn(ids.units, edition)) {
    const id = definitions.current(saved)
    if (nameOf(datasheetOf(entryId)) && (definitions.get('unit', id) || definitions.unavailable.has(id))) units[entryId] = id
    else if (entryId.includes('/')) units[entryId] = null
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
  choices: readonly Pick<UnitChoice, 'name' | 'options'>[]
  /** The unit as VS Data fields it, for a pick by VS Data IDs: VS Data checks it whole, models and wargear included. */
  vs?: VsRosterUnit
  /** What the unit costs the list, which VS Data's ally points limits count. */
  points?: number
}

export type VsDataError = { entryId: string; entryName: string; message: string }

/** The list as VS Data reads it, or null where VS Data cannot place it and leaves it to the catalogue's checks. */
function vsDataPlacement(data: VsRosterData | undefined, list: { catalogueId: string; detachmentIds: readonly string[] }) {
  const placed = vsDataBook(data, list.catalogueId)
  if (!data || !placed) return null
  const { own, without, definitions } = placed
  // A faction that takes no Detachment, as a Titan army does, refuses any it holds, VS Data's or not.
  const detachments = list.detachmentIds.map((id) => data.detachments[id] ?? (without ? `unknown:${id}` : undefined))
  // A list with a Detachment VS Data does not file under its faction stays with the catalogue's checks.
  if (!without && detachments.some((id) => !id || !own.has(definitions.get('detachment', id)?.data.faction))) return null
  return { ...placed, detachments }
}

/**
 * The list's units (by `CheckedUnit.key`) that VS Data's checker counts towards an ally points limit at the list's battle
 * size: each joins the first ally entry offering it under one of the list's Detachments, as `checkVsRoster` reads it.
 */
export function vsDataAllyLimited(
  data: VsRosterData | undefined,
  list: { catalogueId: string; detachmentIds: readonly string[]; limit: number },
  units: readonly Pick<CheckedUnit, 'key' | 'entryId' | 'name' | 'vs'>[],
): Set<number> {
  const placed = vsDataPlacement(data, list)
  if (!data || !placed) return new Set()
  const { definitions, detachments } = placed
  const battleSize = definitions.all('battle-size').find((size) => size.data.points === list.limit)?.id
  const allies = placed.record?.allies ?? []
  return new Set(
    units.flatMap((unit) => {
      const id = unit.vs?.unit ?? vsDataChecks(data, list.catalogueId, unit)
      const entry = allies.find(
        (ally) => ally.units.includes(id ?? '') && (!ally.detachments || ally.detachments.some((d) => detachments.includes(d))),
      )
      return entry?.points?.some((row) => row.battleSize === battleSize) ? [unit.key] : []
    }),
  )
}

/**
 * The VS Data Detachments whose ally entries offer a datasheet the list's own Detachments don't, as Deathwatch Support
 * offers Deathwatch to a chapter; null where the list's Detachments offer it or none would, and undefined where VS Data
 * cannot place the list or doesn't read the datasheet, which leaves the answer to the catalogue.
 */
export function vsDataDetachmentsOffering(
  data: VsRosterData | undefined,
  list: { catalogueId: string; detachmentIds: readonly string[] },
  unit: Pick<CheckedUnit, 'entryId' | 'name'>,
): string[] | null | undefined {
  const placed = vsDataPlacement(data, list)
  const id = placed ? vsDataChecks(data, list.catalogueId, unit) : undefined
  if (!placed || !id) return undefined
  // As `checkVsRoster` reads it, an ally entry binds even a unit of the army's own faction, as Yvraine in an Aeldari army.
  const offering = (placed.record?.allies ?? []).filter((ally) => ally.units.includes(id))
  if (offering.some((ally) => !ally.detachments || ally.detachments.some((d) => placed.detachments.includes(d)))) return null
  const detachments = [...new Set(offering.flatMap((ally) => ally.detachments ?? []))]
  return detachments.length ? detachments : null
}

/** Whether VS Data's checker reads the list as a whole, as `vsDataErrors` does wherever it is not null. */
export const vsDataPlaces = (data: VsRosterData | undefined, list: { catalogueId: string; detachmentIds: readonly string[] }) =>
  vsDataPlacement(data, list) !== null

/**
 * What VS Data's checker finds wrong with a list beyond its units' wargear, which the catalogue still builds: allies,
 * exclusions, copies, unit limits, sizes, Enhancements, Warlord, allegiances and Detachment groups. Null where VS Data
 * cannot place the list, which leaves it to the catalogue's checks.
 */
export function vsDataErrors(
  data: VsRosterData | undefined,
  list: { catalogueId: string; detachmentIds: readonly string[]; borrowedDetachmentId?: string | null; limit: number },
  units: readonly CheckedUnit[],
): VsDataError[] | null {
  const placed = vsDataPlacement(data, list)
  if (!data || !placed) return null
  const { definitions, faction, without, detachments } = placed
  const battleSize = definitions.all('battle-size').find((size) => size.data.points === list.limit)?.id
  const taken = new Set<string>()
  const checked = units.flatMap((unit): { unit: CheckedUnit; read: VsRosterUnit; offersAllegiance: boolean }[] => {
    if (unit.vs) {
      if (unit.vs.enhancement) taken.add(unit.vs.enhancement)
      return [{ unit, read: unit.vs, offersAllegiance: true }]
    }
    const id = vsDataChecks(data, list.catalogueId, unit)
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
  const priced = checked.map(({ unit }) => ({ points: unit.points ?? 0, unpriced: [] }))
  const price = { units: priced, points: priced.reduce((sum, { points }) => sum + points, 0), detachmentPoints: 0, unpriced: [] }
  const errors = checkVsRoster(definitions, roster, price)
    .filter((problem) => problem.code !== 'allegiance-missing' || checked[problem.unit ?? -1]?.offersAllegiance)
    // Saying it takes no Detachment says each one it holds is not its own.
    .filter((problem) => !without || problem.code !== 'detachment-faction')
    .flatMap((problem) => described(problem, checked, definitions) ?? [])
  // A faction that takes no Detachment borrows none either, King of the Colosseum's borrowed disposition included.
  const borrows = without && list.borrowedDetachmentId && !errors.some((error) => error.message === 'takes no Detachment')
  return borrows ? [...errors, { entryId: 'army', entryName: 'Army', message: 'takes no Detachment' }] : errors
}

/**
 * The VS Data faction a book's lists are checked as, with the factions whose units and Detachments are its own, and its
 * `withoutDetachments`; null where VS Data cannot place its lists, which leaves them to the catalogue's checks. That is a
 * book with no VS Data faction, one with neither Detachments of its own nor `withoutDetachments`, and one none of whose
 * datasheets reads as its own.
 */
export function vsDataBook(data: VsRosterData | undefined, catalogueId: string) {
  if (!data) return null
  const definitions = remember(definitionsOf, data, () => vsDataDefinitions(data.construction))
  const faction = data.books[catalogueId.slice(catalogueId.indexOf('~') + 1)]
  const record = faction ? definitions.get('faction', faction)?.data : undefined
  if (!faction || !record) return null
  const own: ReadonlySet<string | undefined> = new Set([faction, record.parent])
  const without = record.withoutDetachments
  // A book key says what a datasheet is in that book alone, so it counts only for its own book.
  const book = catalogueId.slice(catalogueId.indexOf('~') + 1)
  const byBook = remember(ownedFactions, data, () => new Map<string, Set<string>>())
  const owned =
    byBook.get(book) ??
    new Set(
      Object.entries(data.units).flatMap(([key, id]) =>
        id && (!key.includes('/') || key.startsWith(`${book}/`)) ? (definitions.get('unit', id)?.data.faction ?? []) : [],
      ),
    )
  byBook.set(book, owned)
  if (![...own].some((candidate) => candidate !== undefined && owned.has(candidate))) return null
  if (!without && !definitions.all('detachment').some((detachment) => own.has(detachment.data.faction))) return null
  return { definitions, faction, record, own, without }
}

const ownedFactions = new WeakMap<VsRosterData, Map<string, Set<string>>>()

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
    // As the catalogue words a Detachment lock: needs the Deathwatch Support detachment.
    'ally-detachment': `needs the ${joined(
      (/ needs one of (.+)$/.exec(problem.message)?.[1] ?? '').split(', ').map(named),
      'or',
    )} detachment`,
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
    'enhancement-exclusive': named(problem.message.replace(/^.*? takes only/, 'takes only')),
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
  // Only a unit VS Data fields by its IDs has its own models and wargear read; another's are the catalogue's to say.
  const text = message[problem.code] ?? (unit?.vs ? unitWords(problem, named) : undefined)
  return text ? { ...owner, message: text } : null
}

/** The bound a count breaks, as a player reads it. */
const bound = (min: string, max: string, has: string) =>
  min === max ? min : Number(has) > Number(max) ? `at most ${max}` : `at least ${min}`
/** A list of names, the last joined by `word`. */
const joined = (names: readonly string[], word: string) =>
  names.length > 1 ? `${names.slice(0, -1).join(', ')} ${word} ${names.at(-1)}` : (names[0] ?? '')
const plural = (count: string, noun: string) => `${noun}${/(^| )1$/.test(count) ? '' : 's'}`

/** A problem with a unit's own models or wargear, which VS Data checks for a unit fielded by its IDs. */
function unitWords(problem: VsProblem, named: (text: string) => string): string | undefined {
  const text = named(problem.message)
  const words = (pattern: RegExp, say: (...parts: string[]) => string, from = text) => {
    const parts = pattern.exec(from)
    return parts ? say(...parts.slice(1)) : undefined
  }
  // A list of IDs, each named apart, since a name may hold a comma itself (Pulsa Rokkit (Once per battle, per unit)).
  const names = (ids: string) => ids.split(', ').map(named)
  const ids = (kind: string) => `((?:${kind}:[\\w.-]+, )*${kind}:[\\w.-]+)`
  switch (problem.code) {
    case 'model-count':
      return words(/^(.+) needs (\d+)-(\d+) models, has (-?\d+)$/, (model, min, max, has) => {
        const allowed = bound(min, max, has)
        return `fields ${allowed} ${model} ${plural(allowed, 'model')}, has ${has}`
      })
    case 'model-group-count':
      return words(/^(.+) together need (\d+)-(\d+) models, have (\d+)$/, (models, min, max, has) => {
        const allowed = bound(min, max, has)
        return `fields ${allowed} ${joined(models.split(', '), 'and')} ${plural(allowed, 'model')} together, has ${has}`
      })
    case 'unit-composition':
      return 'fields its models in a mix its datasheet does not allow'
    case 'option-count':
      return words(
        /^(.+) takes (\d+)-(\d+), has (\d+)$/,
        (option, min, max, has) => `takes ${bound(min, max, has)} from ${option}, has ${has}`,
      )
    case 'option-uniform':
      return (
        words(
          /^(.+) take one choice together, or none of them takes one$/,
          (options) => `takes the same choice for ${joined(options.split(', '), 'and')}, or none`,
        ) ?? words(/^(.+) is taken (\d+) times .*$/, (option, max) => `takes ${option} ${max} times with one choice, or not at all`)
      )
    case 'option-cap':
      return words(
        new RegExp(`^.+ takes at most (\\d+) of ${ids('wargear')}, has (\\d+)$`),
        (max, wargear, has) => `takes at most ${max} ${joined(names(wargear), 'or')}, has ${has}`,
        problem.message,
      )
    case 'option-unavailable':
      return words(
        new RegExp(`^(.+) needs one of ${ids('wargear')} from roster-option:[\\w.-]+$`),
        (option, wargear) => `needs ${joined(names(wargear), 'or')} to take ${option}`,
        problem.message,
      )
    case 'option-group-count':
      return words(
        new RegExp(`^${ids('roster-option')} together take (at most|at least) (\\d+), have (\\d+)$`),
        (options, side, n, has) => `takes ${side} ${n} from ${joined(names(options), 'and')} together, has ${has}`,
        problem.message,
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

/** The problems VS Data's checker finds with a unit alone, which say nothing of the roster around it. */
const OWN_PROBLEMS = new Set<VsProblem['code']>([
  'missing-definition',
  'not-current',
  'unit-model',
  'model-count',
  'model-group-count',
  'unit-size',
  'unit-composition',
  'unit-option',
  'option-choice',
  'option-count',
  'option-quantity',
  'option-uniform',
  'option-cap',
  'option-unavailable',
  'option-group-count',
  'enhancement-detachment',
  'enhancement-exclusive',
  'enhancement-keywords',
  'enhancement-repeated',
  'warlord-ineligible',
  'allegiance-missing',
  'allegiance-choice',
  'allegiance-requires',
])

/**
 * What is wrong with each unit the list fields by VS Data IDs, for a list VS Data cannot place, whose roster the
 * catalogue checks instead: VS Data's checker on the list as far as it reads it (its book's faction, else the first
 * such unit's, and each Detachment it defines), keeping only what concerns each such unit alone.
 */
export function vsPickErrors(
  data: VsRosterData | undefined,
  list: { catalogueId: string; detachmentIds: readonly string[]; limit: number },
  units: readonly CheckedUnit[],
): VsDataError[] {
  const picks = units.flatMap((unit) => (unit.vs ? [{ unit, read: unit.vs }] : []))
  if (!data || !picks.length) return []
  const definitions = remember(definitionsOf, data, () => vsDataDefinitions(data.construction))
  const faction =
    data.books[list.catalogueId.slice(list.catalogueId.indexOf('~') + 1)] ??
    definitions.get('unit', picks[0]!.read.unit)?.data.faction ??
    ''
  const detachments = list.detachmentIds.flatMap((id) => {
    const vs = data.detachments[id]
    return vs && definitions.get('detachment', vs) ? [vs] : []
  })
  const battleSize = definitions.all('battle-size').find((size) => size.data.points === list.limit)?.id
  const roster = { faction, detachments, ...(battleSize ? { battleSize } : {}), units: picks.map(({ read }) => read) }
  const unpriced = { units: [], points: 0, detachmentPoints: 0, unpriced: [] }
  return checkVsRoster(definitions, roster, unpriced)
    .filter((problem) => problem.unit !== undefined && OWN_PROBLEMS.has(problem.code))
    .flatMap((problem) => described(problem, picks, definitions) ?? [])
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
 * defines no unit for, or one it files under a faction the army neither is nor allies with where that may only mean VS
 * Data cannot name it there. That is a Warhammer Legends or Crucible datasheet, which the app's ally lists cannot name,
 * as a fortification, an Aeldari Legends hero or a Crucible Deathwatch Agent; and a unit of a faction that takes no
 * Detachment, as a Titan, which a book can link where its faction's ally lists do not name it.
 */
export function vsDataChecks(
  data: VsRosterData | undefined,
  catalogueId: string,
  unit: Pick<CheckedUnit, 'entryId' | 'name'>,
): string | undefined {
  const id = inBook(data?.units, catalogueId, unit.entryId)
  if (!data || !id) return undefined
  const definitions = remember(definitionsOf, data, () => vsDataDefinitions(data.construction))
  const filed = definitions.get('unit', id)?.data
  if (!filed) return id
  const faction = data.books[catalogueId.slice(catalogueId.indexOf('~') + 1)]
  const army = faction ? definitions.get('faction', faction)?.data : undefined
  const own = new Set([faction, army?.parent])
  const unnamed =
    filed.legends || isNonMatchedPlayName(unit.name) || Boolean(definitions.get('faction', filed.faction)?.data.withoutDetachments)
  const offered = own.has(filed.faction) || (army?.allies ?? []).some((ally) => ally.units.includes(id))
  return unnamed && !offered ? undefined : id
}

/** The force dispositions of a list whose faction takes no Detachment, by their slugs; null for any other faction. */
export function vsDataWithoutDetachments(data: VsRosterData | undefined, catalogueId: string): string[] | null {
  if (!data) return null
  const faction = data.books[catalogueId.slice(catalogueId.indexOf('~') + 1)]
  const definitions = remember(definitionsOf, data, () => vsDataDefinitions(data.construction))
  const without = faction ? definitions.get('faction', faction)?.data.withoutDetachments : undefined
  return without ? (without.dispositions ?? []).map((id) => id.slice(id.lastIndexOf('.') + 1)) : null
}

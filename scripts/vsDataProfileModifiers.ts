import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import type { Catalogue, Condition, ConditionGroup, Definition, LocalConditionGroup, Modifier } from '../src/core/catalogue'
import { remember } from '../src/core/collections'
import { flattenedModifiers } from '../src/core/evaluate'
import { readCatalogueComposition } from '../src/server/catalogueComposition'
import { readVsDataRelease } from '../src/server/vsDataSummaries'
import { abilityKey } from '../src/shared/vsDataAbilities'
import { vsDataEffectBlocksSchema, vsDataEffectsPath, type VsDataEffectBlocks, type VsDataEffectsFile } from '../src/shared/vsDataEffects'
import { catalogueDataDirectory } from './lib/catalogueFiles'
import { loadSnapshotWithRules } from './lib/catalogueSnapshotLoad'

/**
 * Compares every BSData modifier that changes a unit or weapon profile characteristic in the base rules version with
 * VS Data's effect blocks: each modifier's source (the Enhancement, Detachment, wargear or unit option it sits on or is
 * conditioned on) is joined to its VS Data record by BSData alias, else by name within its faction, Detachment or unit,
 * and the record's blocks are asked whether they state the same change. Report only: it writes counts and each
 * non-matching case by name, id and value, never rules text.
 *
 * usage: tsx scripts/vsDataProfileModifiers.ts [--out <file>] [--matches]
 */
/** With `--matches`, the cases VS Data states alike are listed too, to check the joins. */
const { values } = parseArgs({ options: { out: { type: 'string' }, matches: { type: 'boolean' } } })
const directory = path.resolve(catalogueDataDirectory())
const { catalogue } = loadSnapshotWithRules(directory)
const { index } = catalogue
const files = catalogue.definitions!.files.map(({ file }) => file)

const base = readCatalogueComposition(directory)?.editions.find((entry) => entry.base)
const release = readVsDataRelease(directory)
if (!base || !release) throw new Error('the snapshot has no base rules version with a VS Data release')
const effectsFile = vsDataEffectsPath(path.join(directory, 'summaries', `${base.summaries ?? base.edition.id}.json`))
const effects = (JSON.parse(fs.readFileSync(effectsFile, 'utf8')) as VsDataEffectsFile).effects

type Attacks = 'ranged' | 'melee'
/** A characteristic as both sources can state it; BS and WS are one skill, told apart by the attacks. */
type Stat = 'M' | 'T' | 'Sv' | 'W' | 'Ld' | 'OC' | 'InSv' | 'Range' | 'A' | 'Skill' | 'S' | 'AP' | 'D' | 'Keywords' | 'Capacity'
type Characteristic = { label: string; stat: Stat; attacks?: Attacks }

const STATS: Record<string, Record<string, Stat>> = {
  Unit: { M: 'M', T: 'T', Sv: 'Sv', W: 'W', LD: 'Ld', OC: 'OC', InSv: 'InSv' },
  'Ranged Weapons': { Range: 'Range', A: 'A', BS: 'Skill', S: 'S', AP: 'AP', D: 'D', Keywords: 'Keywords' },
  'Melee Weapons': { Range: 'Range', A: 'A', WS: 'Skill', S: 'S', AP: 'AP', D: 'D', Keywords: 'Keywords' },
  Transport: { Capacity: 'Capacity' },
}
type ProfileType = { name: string; characteristicTypes?: { id: string; name: string }[] }
const characteristics = new Map<string, Characteristic>()
for (const file of files)
  for (const type of (file.gameSystem as { profileTypes?: ProfileType[] } | undefined)?.profileTypes ?? [])
    for (const characteristic of type.characteristicTypes ?? []) {
      const stat = STATS[type.name]?.[characteristic.name]
      const attacks = type.name === 'Ranged Weapons' ? 'ranged' : type.name === 'Melee Weapons' ? 'melee' : undefined
      if (stat) characteristics.set(characteristic.id, { label: `${type.name.split(' ')[0]} ${characteristic.name}`, stat, attacks })
    }

// What a modifier sits in, outermost first, and every catalogue node's place in its file.
type Place = { id: string; name: string; kind: 'entry' | 'group' | 'profile' | 'other' }
type Found = { modifier: Modifier; characteristic: Characteristic; catalogue: string; places: Place[] }
const found: Found[] = []
const ancestry = new Map<string, string[]>()
const CHILDREN = [
  'selectionEntries',
  'sharedSelectionEntries',
  'selectionEntryGroups',
  'sharedSelectionEntryGroups',
  'entryLinks',
  'profiles',
  'sharedProfiles',
  'infoLinks',
  'infoGroups',
  'sharedInfoGroups',
  'forceEntries',
  'categoryEntries',
] as const
type Node = Partial<Record<(typeof CHILDREN)[number], Node[]>> & {
  id?: string
  name?: string
  type?: string
  targetId?: string
  typeName?: string
  modifiers?: Modifier[]
}

function kindOf(key: string, node: Node): Place['kind'] {
  if (key.toLowerCase().includes('profile') || (key === 'infoLinks' && node.type === 'profile')) return 'profile'
  if (key.toLowerCase().includes('group') && !key.includes('info')) return 'group'
  if (key.endsWith('electionEntries')) return 'entry'
  if (key === 'entryLinks') return node.type === 'selectionEntryGroup' ? 'group' : 'entry'
  return 'other'
}

function walk(node: Node, places: Place[], book: string) {
  for (const key of CHILDREN)
    for (const child of node[key] ?? []) {
      const place: Place = { id: child.id ?? '', name: child.name ?? '', kind: kindOf(key, child) }
      if (child.id)
        ancestry.set(
          child.id,
          places.map((outer) => outer.name),
        )
      const inside = [...places, place]
      for (const modifier of flattenedModifiers([child])) {
        const characteristic = characteristics.get(modifier.field)
        if (characteristic) found.push({ modifier, characteristic, catalogue: book, places: inside })
      }
      walk(child, inside, book)
    }
}
for (const file of files) {
  const book = file.catalogue ?? file.gameSystem
  if (book) walk(book, [], book.id)
}

// The datasheets each entry is part of, following links.
const owners = new Map<string, Set<string>>()
const childrenOf = (definition: Definition) => [
  ...(definition.selectionEntries ?? []),
  ...(definition.selectionEntryGroups ?? []),
  ...(definition.entryLinks ?? []),
]
for (const sheets of index.datasheets.values())
  for (const sheet of sheets) {
    const seen = new Set<string>()
    const queue = [sheet]
    while (queue.length) {
      const id = queue.pop()!
      if (seen.has(id)) continue
      seen.add(id)
      remember(owners, id, () => new Set()).add(sheet)
      const definition = index.definitions.get(id)
      if (!definition) continue
      if ('targetId' in definition) queue.push(definition.targetId)
      for (const child of childrenOf(definition)) queue.push(child.id)
    }
  }

// VS Data's records: by BSData alias, by owner, and by name.
const aliased = new Map<string, string>()
for (const [key, aliases] of Object.entries(release.entries))
  for (const alias of aliases) if (alias.startsWith('bsdata.')) aliased.set(alias.slice('bsdata.'.length).replaceAll('.', '-'), key)
const factionOf = (key: string) => key.slice(key.indexOf(':') + 1, key.indexOf('.'))
const ownerOf = (key: string) => key.slice(key.indexOf(':') + 1, key.lastIndexOf('.'))
const nameOf = (key: string) => key.slice(key.lastIndexOf('.') + 1)
const byOwner = new Map<string, string[]>()
const byName = new Map<string, string[]>()
for (const key of Object.keys(release.entries))
  if (key.startsWith('ability:')) {
    remember(byOwner, ownerOf(key), () => []).push(key)
    remember(byName, abilityKey(nameOf(key)), () => []).push(key)
  }
/** Each VS Data Detachment's owner prefix by its name's key, and the Stratagems and Enhancements that are not its rules. */
const detachmentsByName = new Map<string, string[]>()
const notDetachmentRules = new Set<string>()
for (const detachment of release.detachments) {
  const ids = [...detachment.stratagems, ...detachment.enhancements]
  for (const id of ids) notDetachmentRules.add(`ability:${id}`)
  const prefix = ids[0]?.slice(0, ids[0].lastIndexOf('.'))
  if (prefix) remember(detachmentsByName, abilityKey(detachment.name), () => []).push(prefix)
}
const enhancementIds = new Set(release.detachments.flatMap((detachment) => detachment.enhancements.map((id) => `ability:${id}`)))

// The VS Data factions of each catalogue, from its datasheets' aliases and those of each catalogue importing it.
const factionsOf = new Map<string, Set<string>>()
for (const [book, sheets] of index.datasheets)
  for (const sheet of sheets) {
    const unit = aliased.get(sheet)
    if (unit?.startsWith('unit:')) remember(factionsOf, book, () => new Set()).add(factionOf(unit))
  }
for (const file of files) {
  const book: Catalogue | undefined = file.catalogue ?? file.gameSystem
  for (const link of book?.catalogueLinks ?? [])
    for (const faction of factionsOf.get(book!.id) ?? []) remember(factionsOf, link.targetId, () => new Set()).add(faction)
}

// Source classes, most specific first: a modifier belongs to the best of the entry holding it and those it asks for.
const CLASSES = ['crusade', 'enhancement', 'detachment', 'wargear', 'unit', 'other'] as const
type SourceClass = (typeof CLASSES)[number]
const detachmentIds = new Set<string>()
for (const options of catalogue.detachments.values())
  for (const option of options.options) {
    detachmentIds.add(option.id)
    const definition = index.definitions.get(option.id)
    if (definition && 'targetId' in definition) detachmentIds.add(definition.targetId)
  }
const enhancementCost = [...index.costTypes.values()].find((type) => type.name === 'Enhancements')?.id
/** Crusade and Boarding Actions content, which VS Data does not cover, by the names of its groups or entries. */
const CRUSADE =
  /crusade|battle traits?|battle scars?|relics|battle honours?|requisition|specialisms|boons|aeldari paths|-level assets|strains|burdens|bossloot|archeotech|idolator|pacts of damnation|masteries|district abilities|commendations|tours of duty|elixirs|dark destiny|boarding act/i
const PROFILE_TYPES = new Set(['Ranged Weapons', 'Melee Weapons', 'Abilities'])

function resolve(id: string) {
  const definition = index.definitions.get(id)
  const target = definition && 'targetId' in definition ? index.definitions.get(definition.targetId) : undefined
  return { definition, target }
}

function classify(id: string): SourceClass | null {
  const { definition, target } = resolve(id)
  if (!definition) return null
  const both = [definition, ...(target ? [target] : [])]
  // A group, or a link to one, is no source of its own.
  const entryType = (target ?? definition).type
  if (!entryType || entryType === 'selectionEntry' || entryType === 'selectionEntryGroup') return null
  const names = both.flatMap((entry) => [...(ancestry.get(entry.id) ?? []), entry.name ?? ''])
  if (CRUSADE.test(names.join(' / '))) return 'crusade'
  if (both.some((entry) => entry.costs?.some((cost) => cost.typeId === enhancementCost && cost.value > 0))) return 'enhancement'
  // A weapon an Enhancement upgrades is an entry of its own, named for the Enhancement.
  const factions = factionsFor(id, index.catalogueOf.get(id) ?? '')
  const name = abilityKey(target?.name ?? definition.name ?? '')
  if ((byName.get(name) ?? []).some((key) => enhancementIds.has(key) && factions.has(factionOf(key)))) return 'enhancement'
  if (detachmentIds.has(id) || (target && detachmentIds.has(target.id))) return 'detachment'
  if (entryType === 'unit' || entryType === 'model' || entryType === 'model-or-unit') return 'unit'
  if (!owners.has(id) && !(target && owners.has(target.id))) return 'other'
  const profiled = both.some(
    (entry) =>
      entry.profiles?.some((profile) => PROFILE_TYPES.has(profile.typeName ?? '')) ||
      entry.infoLinks?.some((link) => {
        const shared = index.shared.get(link.targetId)
        return link.type === 'profile' && shared && 'typeName' in shared && PROFILE_TYPES.has(shared.typeName ?? '')
      }),
  )
  return profiled ? 'wargear' : 'unit'
}

/** Whether a condition asks that the entry it names be taken, rather than not taken or counted. */
const asks = (condition: Condition) =>
  condition.field === 'selections' &&
  ((condition.type === 'atLeast' && condition.value >= 1) ||
    (condition.type === 'greaterThan' && condition.value >= 0) ||
    (condition.type === 'equalTo' && condition.value >= 1))

function askedIds(conditions: readonly Condition[] = [], groups: readonly (ConditionGroup | LocalConditionGroup)[] = []): string[] {
  return [
    ...conditions.filter(asks).flatMap((condition) => (condition.childId ? [condition.childId] : [])),
    ...groups.flatMap((group) => askedIds(group.conditions, group.conditionGroups)),
  ]
}

/** The entry a modifier is about, and its class. */
function sourceOf(item: Found): { id: string; name: string; sourceClass: SourceClass } | null {
  const holder = item.places.findLast((place) => place.kind === 'entry')
  const outer = new Set(item.places.map((place) => place.id))
  const candidates = [
    ...(holder ? [holder.id] : []),
    ...askedIds(item.modifier.conditions, item.modifier.conditionGroups).filter((id) => !outer.has(id) && index.definitions.has(id)),
  ]
  let best: { id: string; sourceClass: SourceClass } | null = null
  for (const id of candidates) {
    const sourceClass = classify(id)
    if (sourceClass && (!best || CLASSES.indexOf(sourceClass) < CLASSES.indexOf(best.sourceClass))) best = { id, sourceClass }
  }
  if (!best) return null
  const { definition, target } = resolve(best.id)
  return { ...best, name: definition?.name ?? target?.name ?? '' }
}

// What a BSData modifier changes, as VS Data could state it.
type Change =
  | { kind: 'bookkeeping'; why: string }
  | { kind: 'unexpressible'; why: string }
  | { kind: 'add' | 'set'; value: number }
  | { kind: 'keywords'; value: string[] }

const roll = (value: unknown) => /^(\d)\+$/.exec(String(value).trim())?.[1]
const integer = (value: unknown) => (/^-?\d+$/.test(String(value).trim()) ? Number(value) : undefined)
const ADDS = new Set<Stat>(['A', 'Skill', 'S', 'AP', 'D', 'T', 'W', 'M', 'Ld', 'OC'])
const SETS = new Set<Stat>(['A', 'Skill', 'S', 'AP', 'D', 'Sv', 'InSv'])
/** A weapon keyword as VS Data writes it; BSData's display qualifier after a colon, such as the targets it excludes, is dropped. */
const normalKeyword = (keyword: string) => keyword.replace(/:.*$/, '').trim().replaceAll(/\s+/g, ' ').toUpperCase()
const AFFECTS_CONTROLS = new Set(['self', 'entries', 'forces', 'recursive', 'group', 'associations'])

function changeOf(modifier: Modifier, { stat }: Characteristic): Change {
  const { type, value, arg } = modifier
  if (type === 'floor' || type === 'ceil') return { kind: 'bookkeeping', why: `${type} bound` }
  if (value === '+0' || arg === '+0') return { kind: 'bookkeeping', why: 'variable-characteristic marker' }
  // A change aimed only at weapons a dice-characteristic marker names, or at an id nothing has, only corrects another.
  const filters = (modifier.affects ?? '')
    .split('.profiles.')[0]!
    .split('.')
    .filter((part) => !AFFECTS_CONTROLS.has(part))
  const marker = (id: string) => {
    const category = index.categories.get(id)
    if (category) return Boolean(category.hidden && /\bDx\b|\+0/.test(category.name ?? ''))
    return /^[0-9a-f]{2,4}-/.test(id) && !index.definitions.has(id)
  }
  if (modifier.affects?.includes('.profiles.') && filters.some(marker))
    return { kind: 'bookkeeping', why: 'correction scoped to a marker category' }
  if (stat === 'Range' || stat === 'Capacity') return { kind: 'unexpressible', why: `no ${stat} field` }
  if (stat === 'Keywords') {
    if (type !== 'append') return { kind: 'unexpressible', why: `keywords ${type}` }
    const keywords = String(value).split(',').map(normalKeyword).filter(Boolean)
    return keywords.length ? { kind: 'keywords', value: keywords } : { kind: 'unexpressible', why: 'empty keywords' }
  }
  if (type === 'increment' || type === 'decrement') {
    const amount = integer(value)
    if (amount === undefined) return { kind: 'unexpressible', why: `${type} by ${String(value)}` }
    const add = type === 'increment' ? amount : -amount
    if (stat === 'Sv') return add < 0 ? { kind: 'add', value: add } : { kind: 'unexpressible', why: 'worsen Save' }
    return ADDS.has(stat) ? { kind: 'add', value: add } : { kind: 'unexpressible', why: `add to ${stat}` }
  }
  if (type === 'set' || type === 'replace' || (type === 'append' && stat === 'InSv')) {
    const number = stat === 'Skill' || stat === 'Sv' || stat === 'InSv' ? roll(value) : integer(value)
    if (!SETS.has(stat)) return { kind: 'unexpressible', why: `set ${stat}` }
    return number === undefined ? { kind: 'unexpressible', why: `set ${stat} to a non-integer` } : { kind: 'set', value: Number(number) }
  }
  return { kind: 'unexpressible', why: `${type} ${stat}` }
}

// What a VS Data record states, as the same atoms.
type Atom = {
  stat: Stat
  op: 'add' | 'set' | 'keyword'
  value: number | string
  attacks?: readonly Attacks[]
  conditional: boolean
  via: string
}
const VS_STATS: Record<string, Stat> = {
  attacks: 'A',
  'ballistic-skill': 'Skill',
  'weapon-skill': 'Skill',
  strength: 'S',
  'armour-penetration': 'AP',
  damage: 'D',
  movement: 'M',
  leadership: 'Ld',
  'objective-control': 'OC',
}
type Blocks = { atoms: Atom[]; unreadable?: string; upgradesWeapon: boolean; unresolved: string[]; uncalculated: boolean }
const blocksCache = new Map<string, Blocks>()

function blocksOf(key: string): Blocks {
  return remember(blocksCache, key, () => {
    const raw = effects[key]
    const parsed = vsDataEffectBlocksSchema.safeParse(raw ?? {})
    if (!parsed.success)
      return { atoms: [], unreadable: 'blocks fail the schema', upgradesWeapon: false, unresolved: [], uncalculated: false }
    const blocks: VsDataEffectBlocks = parsed.data
    const atoms: Atom[] = []
    const unresolved = Object.entries(blocks)
      .filter(([, block]) => block && typeof block === 'object' && 'unresolved' in block)
      .map(([name]) => name)
    if (blocks.invulnerableSave && !('unresolved' in blocks.invulnerableSave)) {
      const { roll: value, conditional, keywords } = blocks.invulnerableSave
      atoms.push({ stat: 'InSv', op: 'set', value, conditional: Boolean(conditional || keywords), via: 'invulnerableSave' })
    }
    if (blocks.weaponAbilities && !('unresolved' in blocks.weaponAbilities))
      for (const ability of blocks.weaponAbilities)
        atoms.push({
          stat: 'Keywords',
          op: 'keyword',
          value: normalKeyword(ability.ability),
          attacks: ability.attacks,
          conditional: Boolean(ability.keywords),
          via: 'weaponAbilities',
        })
    if (blocks.combat && !('unresolved' in blocks.combat))
      for (const reading of blocks.combat.readings)
        for (const [via, choices, fallbackDefault] of [
          ['combat', reading.choices ?? [], reading.default ?? 0],
          ['shown', reading.shown?.choices ?? [], reading.shown?.default ?? 0],
          ['fallback', reading.fallback?.choices ?? [], reading.fallback?.default ?? 0],
        ] as const)
          for (const choice of choices) {
            const conditional = choice.conditions.length > 0 || fallbackDefault === 0
            const atom = (stat: Stat, op: Atom['op'], value: number | string, attacks?: readonly Attacks[]) =>
              atoms.push({ stat, op, value, attacks, conditional, via })
            for (const effect of choice.effects) {
              if (effect.characteristic) {
                const { name, add, set } = effect.characteristic
                if (add !== undefined) atom(VS_STATS[name]!, 'add', add, effect.attacks)
                if (set !== undefined) atom(VS_STATS[name]!, 'set', set, effect.attacks)
              }
              if (effect.weaponAbility) atom('Keywords', 'keyword', normalKeyword(effect.weaponAbility), effect.attacks)
              if (effect.invulnerable !== undefined) atom('InSv', 'set', effect.invulnerable)
              if (effect.save !== undefined) atom('Sv', 'set', effect.save)
              if (effect.improveSave) atom('Sv', 'add', -effect.improveSave.by)
              if (effect.toughness !== undefined) atom('T', 'add', effect.toughness)
              if (effect.wounds !== undefined) atom('W', 'add', effect.wounds)
              if (effect.unitStat) atom(VS_STATS[effect.unitStat.kind]!, 'add', effect.unitStat.add)
            }
          }
    // A reading without choices is one VS Data says cannot be calculated.
    const uncalculated = Boolean(
      blocks.combat && !('unresolved' in blocks.combat) && blocks.combat.readings.some((reading) => !reading.choices),
    )
    return { atoms, upgradesWeapon: blocks.upgradesWeapon === true, unresolved, uncalculated }
  })
}

const describe = (atom: Atom) =>
  `${atom.stat}${atom.op === 'add' ? (Number(atom.value) >= 0 ? '+' : '') : atom.op === 'set' ? '=' : ' '}${atom.value}` +
  `${atom.attacks ? ` ${atom.attacks.join('/')}` : ''}${atom.conditional ? ' (conditional)' : ''} [${atom.via}]`

// The VS Data records a source joins.
type Join = { records: string[]; by: 'alias' | 'name' | 'unit-abilities' | 'detachment-rules' | 'none' }

function factionsFor(id: string, catalogueId: string) {
  const factions = new Set([...(factionsOf.get(catalogueId) ?? []), ...(factionsOf.get(index.catalogueOf.get(id) ?? '') ?? [])])
  for (const sheet of owners.get(id) ?? []) {
    const unit = aliased.get(sheet)
    if (unit?.startsWith('unit:')) factions.add(factionOf(unit))
  }
  return factions
}

function unitsFor(id: string, places: readonly Place[]) {
  const sheets = new Set([...(owners.get(id) ?? []), ...places.flatMap((place) => [...(owners.get(place.id) ?? [])])])
  const { target } = resolve(id)
  for (const sheet of target ? (owners.get(target.id) ?? []) : []) sheets.add(sheet)
  return [...sheets].flatMap((sheet) => {
    const unit = aliased.get(sheet)
    return unit?.startsWith('unit:') ? [unit.slice('unit:'.length)] : []
  })
}

function joinOf(source: { id: string; name: string; sourceClass: SourceClass }, item: Found): Join {
  const { definition, target } = resolve(source.id)
  const entries = [definition, target].filter((entry): entry is Definition => Boolean(entry))
  const ids = entries.flatMap((entry) => [
    entry.id,
    ...(entry.profiles ?? []).map((profile) => profile.id),
    ...(entry.infoLinks ?? []).flatMap((link) => [link.id, link.targetId]),
    ...(entry.rules ?? []).map((rule) => rule.id),
    ...(entry.infoGroups ?? []).flatMap((group) => (group.profiles ?? []).map((profile) => profile.id)),
  ])
  const byAlias = [...new Set(ids.flatMap((id) => aliased.get(id) ?? []))].filter((key) => key.startsWith('ability:'))
  const factions = factionsFor(source.id, item.catalogue)
  const named = (byName.get(abilityKey(source.name)) ?? []).filter((key) => factions.has(factionOf(key)))
  const units = unitsFor(source.id, item.places)
  const ownNamed = named.filter((key) => units.includes(ownerOf(key)))
  // What a datasheet or its option changes can come from any of the unit's abilities.
  if (source.sourceClass === 'unit') {
    const records = [...new Set([...byAlias, ...ownNamed, ...units.flatMap((unit) => byOwner.get(unit) ?? [])])]
    const by = byAlias.length ? 'alias' : ownNamed.length ? 'name' : 'unit-abilities'
    return records.length ? { records, by } : { records: [], by: 'none' }
  }
  if (byAlias.length) return { records: byAlias, by: 'alias' }
  if (source.sourceClass === 'detachment') {
    const prefixes = (detachmentsByName.get(abilityKey(source.name)) ?? []).filter((prefix) => factions.has(prefix.split('.')[0]!))
    const rules = prefixes.flatMap((prefix) => (byOwner.get(prefix) ?? []).filter((key) => !notDetachmentRules.has(key)))
    return rules.length ? { records: rules, by: 'detachment-rules' } : { records: [], by: 'none' }
  }
  if (source.sourceClass === 'enhancement') {
    const enhancements = named.filter((key) => enhancementIds.has(key))
    if (enhancements.length) return { records: enhancements, by: 'name' }
  }
  if (ownNamed.length) return { records: ownNamed, by: 'name' }
  if (named.length) return { records: named, by: 'name' }
  return { records: [], by: 'none' }
}

type Outcome = 'same' | 'differs' | 'lacks' | 'noRecord' | 'unexpressible' | 'unclassified' | 'bookkeeping'
const OUTCOMES: Outcome[] = ['same', 'differs', 'lacks', 'noRecord', 'unexpressible', 'unclassified', 'bookkeeping']
type Tally = Record<Outcome | 'sameConditional' | 'total', number>
const tally = (): Tally => ({ ...Object.fromEntries(OUTCOMES.map((outcome) => [outcome, 0])), sameConditional: 0, total: 0 }) as Tally
const byClass = new Map<string, Tally>()
const byCharacteristic = new Map<string, Tally>()
const reasons = new Map<string, number>()
const cases: unknown[] = []

function compare(change: Change & { kind: 'add' | 'set' | 'keywords' }, characteristic: Characteristic, records: readonly string[]) {
  const all = records.map((record) => ({ record, blocks: blocksOf(record) }))
  const fits = (atom: Atom) =>
    atom.stat === characteristic.stat && (!characteristic.attacks || !atom.attacks || atom.attacks.includes(characteristic.attacks))
  const relevant = all.flatMap(({ record, blocks }) => blocks.atoms.filter(fits).map((atom) => ({ record, atom })))
  const matches = (atom: Atom, keyword?: string) =>
    change.kind === 'keywords' ? atom.op === 'keyword' && atom.value === keyword : atom.op === change.kind && atom.value === change.value
  if (change.kind === 'keywords') {
    const per = change.value.map((keyword) => relevant.filter(({ atom }) => matches(atom, keyword)))
    if (per.every((hits) => hits.length)) {
      const conditional = per.some((hits) => hits.every(({ atom }) => atom.conditional))
      return { outcome: 'same' as const, conditional, record: per[0]![0]!.record, relevant }
    }
  } else {
    const hits = relevant.filter(({ atom }) => matches(atom))
    if (hits.length) {
      const best = hits.find(({ atom }) => !atom.conditional) ?? hits[0]!
      return { outcome: 'same' as const, conditional: best.atom.conditional, record: best.record, relevant }
    }
  }
  if (relevant.length) {
    const ops = new Set(relevant.map(({ atom }) => atom.op))
    const reason =
      change.kind === 'keywords'
        ? 'other weapon abilities'
        : ops.has(change.kind)
          ? 'different value'
          : `${change.kind} where VS Data states ${[...ops].join('/')}`
    return { outcome: 'differs' as const, reason, relevant }
  }
  if (all.some(({ blocks }) => blocks.unreadable)) return { outcome: 'lacks' as const, reason: 'blocks unreadable', relevant }
  if (characteristic.attacks && all.some(({ blocks }) => blocks.upgradesWeapon))
    return { outcome: 'lacks' as const, reason: 'upgradesWeapon only', relevant }
  if (all.some(({ blocks }) => blocks.unresolved.includes('combat') || blocks.unresolved.includes('invulnerableSave')))
    return { outcome: 'lacks' as const, reason: 'block unresolved', relevant }
  if (all.some(({ blocks }) => blocks.uncalculated)) return { outcome: 'lacks' as const, reason: 'combat reading not calculated', relevant }
  if (all.every((entry) => !effects[entry.record])) return { outcome: 'lacks' as const, reason: 'record has no effect blocks', relevant }
  return { outcome: 'lacks' as const, reason: 'no block for this characteristic', relevant }
}

for (const item of found) {
  const { modifier, characteristic } = item
  const change = changeOf(modifier, characteristic)
  const source = sourceOf(item)
  const sourceClass = source?.sourceClass ?? 'unclassified'
  const bsdata = { type: modifier.type, value: modifier.value, ...(modifier.arg ? { arg: modifier.arg } : {}) }
  const flags = [
    ...(modifier.conditions?.length || modifier.conditionGroups?.length ? ['conditioned'] : []),
    ...(modifier.repeats?.length ? ['repeats'] : []),
  ]
  let outcome: Outcome
  let detail: Record<string, unknown> = {}
  if (change.kind === 'bookkeeping') {
    outcome = 'bookkeeping'
    detail = { reason: change.why }
  } else if (!source) {
    outcome = 'unclassified'
    detail = { reason: 'no entry holds or is asked for by the modifier' }
  } else if (change.kind === 'unexpressible') {
    outcome = 'unexpressible'
    detail = { reason: change.why }
  } else {
    const join = joinOf(source, item)
    if (!join.records.length) {
      outcome = 'noRecord'
      detail = { reason: `no ${source.sourceClass} record` }
    } else {
      const compared = compare(change, characteristic, join.records)
      outcome = compared.outcome
      if (compared.outcome === 'same') {
        if (compared.conditional) remember(byClass, sourceClass, tally).sameConditional++
        if (compared.conditional) remember(byCharacteristic, characteristic.label, tally).sameConditional++
      }
      detail = {
        ...('reason' in compared ? { reason: compared.reason } : {}),
        ...('record' in compared ? { matched: compared.record, conditional: compared.conditional } : {}),
        join: join.by,
        records: join.records.length > 6 ? [...join.records.slice(0, 6), `… ${join.records.length - 6} more`] : join.records,
        vs: [...new Set(compared.relevant.map(({ record, atom }) => `${record}: ${describe(atom)}`))].slice(0, 8),
      }
    }
  }
  for (const [store, key] of [
    [byClass, sourceClass],
    [byCharacteristic, characteristic.label],
  ] as const) {
    const counts = remember(store, key, tally)
    counts[outcome]++
    counts.total++
  }
  if (typeof detail.reason === 'string') {
    const reason = `${outcome}: ${detail.reason}`
    reasons.set(reason, (reasons.get(reason) ?? 0) + 1)
  }
  if (outcome !== 'bookkeeping' && (outcome !== 'same' || values.matches))
    cases.push({
      outcome,
      class: sourceClass,
      characteristic: characteristic.label,
      bsdata,
      ...(flags.length ? { flags } : {}),
      source: source && { id: source.id, name: source.name },
      path: item.places.map((place) => place.name).join(' / '),
      catalogue: index.catalogues.get(item.catalogue)?.name ?? item.catalogue,
      ...detail,
    })
}

const sum = (store: Map<string, Tally>) => {
  const total = tally()
  for (const counts of store.values()) for (const key of Object.keys(total) as (keyof Tally)[]) total[key] += counts[key]
  return total
}
const table = (store: Map<string, Tally>) =>
  Object.fromEntries([...store].toSorted(([, left], [, right]) => right.total - left.total).concat([['all', sum(store)]]))
const report = {
  rulesVersion: base.edition.id,
  release: release.release,
  modifiers: found.length,
  byClass: table(byClass),
  byCharacteristic: table(byCharacteristic),
  reasons: Object.fromEntries([...reasons].toSorted(([, left], [, right]) => right - left)),
  cases,
}
const columns = [
  'total',
  'same',
  'sameConditional',
  'differs',
  'lacks',
  'noRecord',
  'unexpressible',
  'unclassified',
  'bookkeeping',
] as const
const print = (title: string, rows: Record<string, Tally>) => {
  console.log(`\n${title.padEnd(16)}${columns.map((column) => column.slice(0, 9).padStart(10)).join('')}`)
  for (const [key, counts] of Object.entries(rows))
    console.log(`${key.slice(0, 16).padEnd(16)}${columns.map((column) => String(counts[column]).padStart(10)).join('')}`)
}
console.log(`${found.length} profile characteristic modifiers in ${base.edition.id}, against VS Data ${release.release}`)
print('class', report.byClass)
print('characteristic', report.byCharacteristic)
console.log('\nreasons')
for (const [reason, count] of Object.entries(report.reasons)) console.log(`${String(count).padStart(6)}  ${reason}`)
if (values.out) {
  fs.mkdirSync(path.dirname(values.out), { recursive: true })
  fs.writeFileSync(values.out, `${JSON.stringify(report, null, 2)}\n`)
}

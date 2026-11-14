import fs from 'node:fs'
import path from 'node:path'
import type { CanonicalDatasheet } from '../src/contracts/catalogue'
import { targetOf } from '../src/core/catalogue'
import { datasheetCharacteristicKindOf } from '../src/core/datasheetStructure'
import { optionWargear } from '../src/core/modelKinds'
import { isNonMatchedPlayName, matchedPlayName, withoutFactionPrefix } from '../src/core/name'
import { buildUnit } from '../src/core/roster'
import { routeSlug } from '../src/core/slug'
import { joinKey } from '../src/core/text'
import { isUnitCompositionChoice, unitChoices } from '../src/core/unitChoices'
import { sizeOf } from '../src/core/unitSize'
import { loadCanonicalCatalogue } from '../src/server/canonicalCatalogue'
import { datasheetsOf, isReferenceDatasheet, loadCatalogue, type LoadedCatalogue } from '../src/server/catalogueIndex'
import { catalogueSources } from '../src/server/catalogueSources'
import { type DatasheetDetails, loadDatacards } from '../src/server/datacards'
import { isMatchedPlayDatasheet } from '../src/shared/catalogueUnit'
import { datacardJoinReport, datacardOf } from '../src/shared/datasheetJoin'
import {
  type DriftReport,
  type Finding,
  type Kind,
  type Source,
  type Unmatched,
  type Values,
  ABSENT,
  PRESENT,
  characteristic,
  finding,
  kdcWeaponKeywords,
  keywordList,
  nameKeys,
  presence,
  renderMarkdown,
  summarize,
  weaponProfileName,
} from './lib/catalogueDrift'
import { catalogueDataDirectory } from './lib/catalogueFiles'
import { cachedUpstream, upstreamHead } from './lib/catalogueUpstream'

/**
 * Compares the snapshot's datasheets and detachments with Game Datacards (at the pin and at
 * HEAD) and 40kdc-data (at HEAD), and writes what disagrees to data-dev/drift/.
 */
const KDC = { repository: 'wn-mitch/40kdc-data', branch: 'main', path: 'data/core' }
const root = path.join(import.meta.dirname, '..')
const output = path.join(root, 'data-dev', 'drift')
const started = performance.now()

type Json = Record<string, any>
type Sheet = {
  statlines: { name: string; values: Record<string, string> }[]
  weapons: { name: string; melee: boolean; values: Record<string, string> }[]
  size: string | null
  keywords: string[]
  attachments: { leader: string[]; support?: string[] }
}

const STATS = ['M', 'T', 'Sv', 'W', 'Ld', 'OC', 'InSv'] as const
const WEAPON_FIELDS = ['Range', 'A', 'Skill', 'S', 'AP', 'D', 'Keywords'] as const
const OUR_STATS: Record<string, (typeof STATS)[number]> = {
  movement: 'M',
  toughness: 'T',
  save: 'Sv',
  wounds: 'W',
  leadership: 'Ld',
  'objective-control': 'OC',
  'invulnerable-save': 'InSv',
}
const OUR_WEAPON_FIELDS: Record<string, (typeof WEAPON_FIELDS)[number]> = {
  range: 'Range',
  attacks: 'A',
  'ballistic-skill': 'Skill',
  'weapon-skill': 'Skill',
  strength: 'S',
  'armour-penetration': 'AP',
  damage: 'D',
}
const en = (value: unknown): string => (typeof value === 'string' ? value : ((value as Json | undefined)?.en ?? ''))
const readJson = (file: string): any => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [])
const sizeLabel = (min: number, max: number) => (min === max ? `${min}` : `${min}-${max}`)

// ---- Praetorium

const directory = catalogueDataDirectory()
const loaded = loadCatalogue(directory)
const canonical = loadCanonicalCatalogue(directory)
if (!loaded || !canonical)
  throw new Error(`No current catalogue snapshot in ${directory}: run \`just dev\` or \`pnpm exec tsx scripts/syncCatalogue.ts --prepare\``)
const snapshotPointer = readJson(path.join(directory, '.snapshot.json')) as Json
const sheets = new Map(canonical.datasheets.map((sheet) => [`${sheet.catalogueId}\0${sheet.id}`, sheet]))

function ourSheet(sheet: CanonicalDatasheet, size: string | null): Sheet {
  return {
    statlines: sheet.profiles
      .filter((profile) => profile.kind === 'unit')
      .map((profile) => ({
        name: profile.name,
        values: Object.fromEntries(
          STATS.map((stat) => [
            stat,
            characteristic(profile.values.find((value) => OUR_STATS[datasheetCharacteristicKindOf(value)] === stat)?.value),
          ]),
        ),
      })),
    weapons: sheet.profiles
      .filter((profile) => profile.kind === 'ranged-weapon' || profile.kind === 'melee-weapon')
      .map((profile) => {
        const values: Record<string, string> = { Keywords: '' }
        for (const value of profile.values) {
          const kind = datasheetCharacteristicKindOf(value)
          if (kind === 'keywords') values.Keywords = keywordList(value.value.split(','))
          else if (OUR_WEAPON_FIELDS[kind]) values[OUR_WEAPON_FIELDS[kind]] = characteristic(value.value)
        }
        return { name: weaponProfileName(profile.name), melee: profile.kind === 'melee-weapon', values }
      }),
    size,
    keywords: sheet.keywords.map(withoutFactionPrefix),
    attachments: {
      leader: sheet.attachments.filter((link) => link.kind === 'leader' && !isNonMatchedPlayName(link.name)).map((link) => link.name),
      support: sheet.attachments.filter((link) => link.kind === 'support' && !isNonMatchedPlayName(link.name)).map((link) => link.name),
    },
  }
}

// ---- Game Datacards

type Cards = { loaded: LoadedCatalogue; raw: Map<DatasheetDetails, Json>; files: Json[] }

/** A datacards directory joined to the catalogue the way the app joins its own, with each joined card's raw record. */
function cardsIn(gdc: string, datacards = loadDatacards(gdc)): Cards {
  const files = fs
    .readdirSync(gdc)
    .filter((file) => file.endsWith('.json'))
    .map((file) => readJson(path.join(gdc, file)))
    .filter((file) => typeof file?.name === 'string' && Array.isArray(file.datasheets))
  const filesByName = new Map(files.map((file) => [file.name as string, file]))
  const raw = new Map<DatasheetDetails, Json>()
  for (const content of new Set(datacards.factions.values())) {
    const file = filesByName.get(content.name)
    for (const [cardName, details] of content.datasheetDetails) {
      const card = file?.datasheets.find((entry: Json) => en(entry.name) === cardName)
      if (card) raw.set(details, card)
    }
  }
  return { loaded: { ...loaded!, factionContents: datacards.factions, datacards }, raw, files }
}

function gdcSheet(cards: Cards, catalogueId: string, entryId: string): Sheet | undefined {
  const joined = datacardOf(cards.loaded, catalogueId, entryId)
  const card = joined && cards.raw.get(joined.details)
  if (!card) return undefined
  const invulnerable = characteristic(card.abilities?.invul?.value)
  const weapons = [
    ...(card.rangedWeapons ?? []).flatMap((weapon: Json) => (weapon.profiles ?? []).map((profile: Json) => ({ ...profile, melee: false }))),
    ...(card.meleeWeapons ?? []).flatMap((weapon: Json) => (weapon.profiles ?? []).map((profile: Json) => ({ ...profile, melee: true }))),
  ]
  const counted = joined.details.modelCount?.match(/(\d+)(?:–(\d+))?/)
  return {
    statlines: (card.stats ?? []).map((line: Json) => ({
      name: en(line.name),
      values: {
        M: characteristic(line.m),
        T: characteristic(line.t),
        Sv: characteristic(line.sv),
        W: characteristic(line.w),
        Ld: characteristic(line.ld),
        OC: characteristic(line.oc),
        InSv: invulnerable,
      },
    })),
    weapons: weapons.map((profile: Json) => ({
      name: weaponProfileName(en(profile.name)),
      melee: profile.melee,
      values: {
        Range: characteristic(profile.range),
        A: characteristic(profile.attacks),
        Skill: characteristic(profile.skill),
        S: characteristic(profile.strength),
        AP: characteristic(profile.ap),
        D: characteristic(profile.damage),
        Keywords: keywordList(profile.keywords ?? []),
      },
    })),
    size: counted ? sizeLabel(Number(counted[1]), Number(counted[2] ?? counted[1])) : null,
    keywords: [...(card.keywords ?? []).map(en), ...(card.factions ?? [])],
    attachments: {
      leader: (card.attachesTo ?? []).filter((link: Json) => link.type === 'leader').map((link: Json) => link.target),
      support: (card.attachesTo ?? []).filter((link: Json) => link.type === 'support').map((link: Json) => link.target),
    },
  }
}

// ---- 40kdc-data

type KdcFaction = {
  names: string[]
  units: Json[]
  weapons: Map<string, Json>
  leads: Map<string, string[]>
  options: Json[]
  compositions: Map<string, Json>
  detachments: Json[]
  enhancements: Json[]
}

function kdcFactions(core: string): KdcFaction[] {
  return fs
    .readdirSync(core)
    .filter((dir) => !dir.startsWith('_') && fs.statSync(path.join(core, dir)).isDirectory())
    .map((dir) => {
      // Combat Patrol records are another game mode, which the catalogue does not hold.
      const at = (file: string) =>
        (readJson(path.join(core, dir, `${file}.json`)) as Json[]).filter(
          (record) => !record.game_modes || record.game_modes.includes('matched-play'),
        )
      const faction = at('factions')[0] ?? {}
      return {
        names: [dir, en(faction.name), ...(faction.aliases ?? [])].filter(Boolean),
        units: at('units'),
        weapons: new Map(at('weapons').map((weapon: Json) => [weapon.id, weapon])),
        leads: new Map(at('leader-attachments').map((link: Json) => [link.leader_id, link.eligible_bodyguard_ids ?? []])),
        options: at('wargear-options'),
        compositions: new Map(at('unit-compositions').map((entry: Json) => [entry.unit_id, entry])),
        detachments: at('detachments'),
        enhancements: at('enhancements'),
      }
    })
}

function kdcSheet(faction: KdcFaction, unit: Json, nameOfUnit: (faction: KdcFaction, id: string) => string): Sheet {
  return {
    statlines: (unit.profiles ?? []).map((line: Json) => ({
      name: line.name,
      values: {
        M: characteristic(line.M),
        T: characteristic(line.T),
        Sv: characteristic(line.Sv),
        W: characteristic(line.W),
        Ld: characteristic(line.Ld),
        OC: characteristic(line.OC),
        InSv: characteristic(line.invuln_sv),
      },
    })),
    weapons: (unit.weapon_ids ?? []).flatMap((id: string) =>
      (faction.weapons.get(id)?.profiles ?? []).map((profile: Json, _: number, profiles: Json[]) => ({
        // A weapon with several profiles may name each by its mode alone.
        name: weaponProfileName(
          profiles.length > 1 && !joinKey(profile.name).includes(joinKey(en(faction.weapons.get(id)!.name)))
            ? `${en(faction.weapons.get(id)!.name)} - ${profile.name}`
            : profile.name,
        ),
        melee: characteristic(profile.range) === 'melee',
        values: {
          Range: characteristic(profile.range),
          A: characteristic(profile.stats?.A),
          Skill: characteristic(profile.stats?.BS ?? profile.stats?.WS),
          S: characteristic(profile.stats?.S),
          AP: characteristic(profile.stats?.AP),
          D: characteristic(profile.stats?.D),
          Keywords: kdcWeaponKeywords(profile.keywords ?? []),
        },
      })),
    ),
    size: unit.model_count ? sizeLabel(unit.model_count.min, unit.model_count.max) : null,
    keywords: [...(unit.keywords ?? []), ...(unit.faction_keywords ?? [])],
    // 40kdc-data records leaders only.
    attachments: { leader: (faction.leads.get(unit.id) ?? []).map((id: string) => nameOfUnit(faction, id)) },
  }
}

/** The 40kdc cap on an option for a unit of `models`, as wargear-option.schema.json describes `model_constraint`. */
function kdcCap(option: Json, models: number, modelsOfName: number) {
  const constraint = option.model_constraint ?? {}
  const counted = constraint.model_name ? modelsOfName : models
  if (constraint.any_number) return constraint.max_count ? counted * constraint.max_count : counted
  if (constraint.per_n_models) return Math.min(Math.floor(models / constraint.per_n_models), constraint.max_count ?? Infinity)
  return constraint.max_count ?? 1
}

// ---- Comparison

type BySource<T> = Partial<Record<Source, T>> & { ours: T }
type Sides = BySource<Sheet>

/** What `read` gives for each source, leaving out a source it gives nothing for. */
const bySource = <T>(sources: readonly Source[], read: (source: Source) => T | undefined) =>
  Object.fromEntries(sources.flatMap((source) => (read(source) === undefined ? [] : [[source, read(source)]]))) as BySource<T>

function byName<T extends { name: string }>(items: readonly T[], name: string) {
  const keys = nameKeys(name)
  return items.find((item) => nameKeys(item.name).some((key) => keys.includes(key)))
}

function compareSheets(faction: string, subject: string, sides: Sides): Finding[] {
  const found: Finding[] = []
  const others = (['gdcPin', 'gdcHead', 'kdc'] as const).filter((source) => sides[source] !== undefined)
  const present = ['ours', ...others] as const
  const add = (kind: Kind, field: string, values: Values) => {
    const result = finding(faction, subject, kind, field, values)
    if (result && !found.some((other) => other.kind === kind && JSON.stringify(other.values) === JSON.stringify(values))) found.push(result)
  }
  for (const line of sides.ours.statlines) {
    // A lone printed statline stands for every model, unless it names another of ours: Canis Rex's line is not Sir Hekhtur's.
    const theirs = Object.fromEntries(
      others.map((source) => {
        const lines = sides[source]!.statlines
        const only = lines.length === 1 ? lines[0]! : undefined
        const shared =
          only &&
          (!sides.ours.statlines.some((ours) => byName(lines, ours.name)) ||
            nameKeys(only.name).some((key) => joinKey(line.name).includes(key)))
        return [source, byName(lines, line.name) ?? (shared ? only : undefined)]
      }),
    )
    for (const stat of STATS) {
      const values: Values = { ours: line.values[stat]! }
      for (const source of others) if (theirs[source]) values[source] = theirs[source].values[stat]
      add('stats', `${line.name}: ${stat}`, values)
    }
  }
  for (const melee of [false, true]) {
    const weaponsOf = (source: Source) => sides[source]!.weapons.filter((weapon) => weapon.melee === melee)
    const names = bySource(present, (source) => weaponsOf(source).map((weapon) => weapon.name))
    for (const { name, values } of presence(names)) {
      const label = sides.ours.weapons.some((weapon) => weapon.melee !== melee && byName([weapon], name))
        ? `${name} (${melee ? 'melee' : 'ranged'})`
        : name
      const ours = byName(weaponsOf('ours'), name)
      // A profile one side lacks is reported once, as the profile's absence, not per characteristic.
      if (!ours || others.some((source) => values[source] === ABSENT)) {
        add('weapons', label, values)
        continue
      }
      for (const field of WEAPON_FIELDS) {
        const compared: Values = { ours: ours.values[field] ?? null }
        for (const source of others) compared[source] = byName(weaponsOf(source), name)?.values[field] ?? null
        add('weapons', `${label}: ${field}`, compared)
      }
    }
  }
  add(
    'size',
    'models',
    bySource(present, (source) => sides[source]!.size),
  )
  // The datasheet's own name is a keyword some sources print and others leave implied.
  const own = nameKeys(matchedPlayName(subject))
  const keywords = bySource(present, (source) =>
    sides[source]!.keywords.filter((keyword) => !nameKeys(keyword).some((key) => own.includes(key))),
  )
  for (const { name, values } of presence(keywords)) add('keywords', name, values)
  for (const kind of ['leader', 'support'] as const) {
    const targets = bySource(present, (source) => sides[source]!.attachments[kind])
    for (const { name, values } of presence(targets)) add('attachments', `${kind === 'leader' ? 'leads' : 'supports'} ${name}`, values)
  }
  return found
}

// ---- Run

const gdcSource = catalogueSources.datacards
const [gdcHead, kdcHead] = [upstreamHead(gdcSource.repository, gdcSource.branch), upstreamHead(KDC.repository, KDC.branch)]
console.log(`Game Datacards ${gdcSource.revision} pinned, ${gdcHead} at HEAD; 40kdc-data ${kdcHead} at HEAD`)
const pinCards = cardsIn(path.join(directory, 'datacards', '11th', 'gdc'), loaded.datacards)
const headCards = cardsIn(await cachedUpstream(gdcSource.repository, gdcHead, gdcSource.path))
const kdc = kdcFactions(await cachedUpstream(KDC.repository, kdcHead, KDC.path))

const ourFaction = new Map<string, string>()
for (const sheet of canonical.datasheets) ourFaction.set(routeSlug(sheet.faction), sheet.faction)
const factionFor = (names: readonly string[]) => names.map((name) => ourFaction.get(routeSlug(name))).find(Boolean) ?? names[0]!

const kdcByRef = new Map<string, { faction: KdcFaction; unit: Json }>()
const kdcByName = new Map<string, { faction: KdcFaction; unit: Json }[]>()
for (const faction of kdc) {
  for (const unit of faction.units) {
    for (const ref of unit.external_refs ?? []) if (ref.namespace === 'bsdata') kdcByRef.set(String(ref.id), { faction, unit })
    const key = nameKeys(matchedPlayName(en(unit.name)))[0]!
    kdcByName.set(key, [...(kdcByName.get(key) ?? []), { faction, unit }])
  }
}

/** A 40kdc unit by the definition's id, else by name among units sharing one of its faction keywords; never a guess between several. */
function kdcUnitFor(sheet: CanonicalDatasheet, definitionId: string, entryId: string) {
  const byRef = kdcByRef.get(definitionId) ?? kdcByRef.get(entryId)
  if (byRef) return { ...byRef, how: 'bsdata-id' as const }
  const factions = new Set(
    sheet.keywords.filter((keyword) => /^faction:/i.test(keyword)).map((keyword) => joinKey(withoutFactionPrefix(keyword))),
  )
  const candidates = nameKeys(matchedPlayName(sheet.name))
    .flatMap((key) => kdcByName.get(key) ?? [])
    .filter(({ unit }) => (unit.faction_keywords ?? []).some((keyword: string) => factions.has(joinKey(keyword))))
  return candidates.length === 1 ? { ...candidates[0]!, how: 'name' as const } : null
}

type Picked = { book: { id: string; name: string }; entryId: string; definitionId: string; sheet: CanonicalDatasheet }
const picked = new Map<string, Picked>()
for (const book of loaded.factions) {
  for (const entryId of datasheetsOf(loaded.index, book.id)) {
    const entry = loaded.index.definitions.get(entryId)
    if (!entry || !isMatchedPlayDatasheet(loaded.index, entry) || !isReferenceDatasheet(loaded, book.id, entryId)) continue
    const sheet = sheets.get(`${book.id}\0${entryId}`)
    if (!sheet) continue
    const definitionId = targetOf(entry, loaded.index.definitions).id
    // A datasheet several books list is compared once, under the book that defines it where one does.
    const previous = picked.get(definitionId)
    if (previous && loaded.index.catalogueOf.get(definitionId) !== book.id) continue
    picked.set(definitionId, { book, entryId, definitionId, sheet })
  }
}

const findings: Finding[] = []
const unmatched: Unmatched[] = []
const matchedKdc = new Set<Json>()
const kdcOwner = new Map<Json, string>()
const kdcMatches = [...picked.values()].map((pick) => {
  const match = kdcUnitFor(pick.sheet, pick.definitionId, pick.entryId)
  if (match) {
    matchedKdc.add(match.unit)
    kdcOwner.set(match.unit, pick.sheet.name)
  }
  return match
})
const kdcName = (faction: KdcFaction, id: string) => {
  const unit = faction.units.find((candidate) => candidate.id === id)
  return unit ? (kdcOwner.get(unit) ?? en(unit.name)) : id
}
const counts = { datasheets: picked.size, gdcPin: 0, gdcHead: 0, kdcById: 0, kdcByName: 0 }

for (const [index, pick] of [...picked.values()].entries()) {
  const { book, entryId, sheet } = pick
  const faction = sheet.faction
  const built = buildUnit(entryId, loaded.index, undefined, undefined, { primaryCatalogueId: book.id })
  const size = built ? sizeOf(built.selection, loaded.index) : null
  const match = kdcMatches[index]
  const sides: Sides = {
    ours: ourSheet(sheet, size ? sizeLabel(size.min, size.max) : null),
    gdcPin: gdcSheet(pinCards, book.id, entryId),
    gdcHead: gdcSheet(headCards, book.id, entryId),
    kdc: match ? kdcSheet(match.faction, match.unit, kdcName) : undefined,
  }
  if (sides.gdcPin) counts.gdcPin++
  else unmatched.push({ faction, name: sheet.name, missingFrom: 'Game Datacards (pinned)' })
  if (sides.gdcHead) counts.gdcHead++
  else unmatched.push({ faction, name: sheet.name, missingFrom: 'Game Datacards (HEAD)' })
  if (match) counts[match.how === 'bsdata-id' ? 'kdcById' : 'kdcByName']++
  else unmatched.push({ faction, name: sheet.name, missingFrom: '40kdc-data' })
  findings.push(...compareSheets(faction, sheet.name, sides))

  if (!match || !built || !size) continue
  // Wargear caps at the largest size, where per-N limits are widest; only 40kdc models them as numbers.
  const largest =
    size.max > size.min ? (buildUnit(entryId, loaded.index, size.max, undefined, { primaryCatalogueId: book.id }) ?? built) : built
  const weaponNames = new Map(
    [...match.faction.weapons.values()].map((weapon) => [
      weapon.id,
      [en(weapon.name), ...(weapon.profiles ?? []).map((profile: Json) => profile.name)],
    ]),
  )
  const options = match.faction.options.filter((option) => option.unit_id === match.unit.id)
  const composition = match.faction.compositions.get(match.unit.id)
  const modelsNamed = (name: string) =>
    Math.max(
      0,
      ...(composition?.models ?? [])
        .filter((model: Json) => joinKey(en(model.name)) === joinKey(name))
        .map((model: Json) => model.max ?? 0),
    )
  const optionKeys = (option: Json) =>
    new Set(
      [...(option.replacement ?? []), ...(option.replacement_choice ?? []).flat()].flatMap((id: string) =>
        (weaponNames.get(id) ?? []).map(joinKey),
      ),
    )
  for (const choice of unitChoices(entryId, largest.selection, loaded.index, { primaryCatalogueId: book.id })) {
    if (isUnitCompositionChoice(choice)) continue
    for (const option of choice.options) {
      if (option.profile !== undefined) continue
      const pieces = [option.name, ...optionWargear(option.id, loaded.index, { primaryCatalogueId: book.id }).map((piece) => piece.name)]
      const keys = pieces.map((piece) => joinKey(piece.replace(/^(\d+x?|one|two|three)\s+/i, '')))
      const hits = options.filter((candidate: Json) => keys.some((key) => optionKeys(candidate).has(key)))
      if (!hits.length) continue
      const caps: number[] = hits.map((hit: Json) => kdcCap(hit, size.max, modelsNamed(hit.model_constraint?.model_name ?? '') || size.max))
      const total = caps.reduce((sum, cap) => sum + cap, 0)
      if (caps.includes(option.max) || total === option.max || (option.max >= size.max && caps.some((cap) => cap >= size.max))) continue
      const result = finding(faction, sheet.name, 'wargear-caps', option.name, { ours: String(option.max), kdc: caps.join(' | ') }, 'low')
      if (result) findings.push(result)
    }
  }
}

// Cards and units no datasheet answers to: new datasheets upstream, or names the joins cannot carry.
const isReference = (catalogueId: string, entryId: string) => {
  const entry = loaded.index.definitions.get(entryId)
  return Boolean(entry && isMatchedPlayDatasheet(loaded.index, entry) && isReferenceDatasheet(loaded, catalogueId, entryId))
}
// A chapter's characters are cards in the Space Marines file and datasheets in the chapter's book: only a name no datasheet has is new.
const pickedNames = new Set([...picked.values()].flatMap((pick) => nameKeys(pick.sheet.name)))
for (const card of datacardJoinReport(headCards.loaded, isReference).datacardsOnly)
  if (!nameKeys(card.name).some((key) => pickedNames.has(key)))
    unmatched.push({
      faction: factionFor([card.faction]),
      name: card.name,
      missingFrom: 'Praetorium datasheet for this Game Datacards (HEAD) card',
    })
for (const faction of kdc)
  for (const unit of faction.units)
    if (!matchedKdc.has(unit) && !unit.is_legend && !isNonMatchedPlayName(en(unit.name)))
      unmatched.push({
        faction: factionFor(faction.names),
        name: en(unit.name),
        missingFrom: 'Praetorium datasheet for this 40kdc-data unit',
      })

// ---- Detachments and enhancements, compared by name across every faction.

type Detachment = { faction: string; name: string; enhancements: Map<string, { name: string; cost: string | null }> }
// Sources disagree on suffixes like "(Upgrade)", " Upgrade" and "(one per army)".
const enhancementKey = (name: string) => joinKey(name.replaceAll(/\([^)]*\)/g, '').replace(/\s+upgrade\s*$/i, ''))
function collect(into: Map<string, Detachment>, faction: string, name: string) {
  const key = joinKey(name)
  const found = into.get(key) ?? { faction, name, enhancements: new Map() }
  into.set(key, found)
  return found
}
const ourDetachments = new Map<string, Detachment>()
for (const detachment of canonical.detachments) {
  const key = joinKey(detachment.name)
  // Chapters list the Space Marines detachments too; keep the book that defines each.
  if (ourDetachments.has(key) && loaded.index.catalogueOf.get(detachment.id) !== detachment.catalogueId) continue
  ourDetachments.delete(key)
  const found = collect(ourDetachments, detachment.faction, detachment.name)
  for (const enhancement of [...detachment.enhancements, ...detachment.upgrades])
    found.enhancements.set(enhancementKey(enhancement.name), {
      name: enhancement.name,
      cost: enhancement.points === null ? null : String(enhancement.points),
    })
}
function gdcDetachments(cards: Cards) {
  const found = new Map<string, Detachment>()
  for (const file of cards.files) {
    for (const detachment of file.detachments ?? [])
      collect(found, factionFor([detachment.faction, file.name].filter(Boolean)), en(detachment.name))
    for (const enhancement of file.enhancements ?? []) {
      if (!enhancement.detachment) continue
      const detachment = collect(found, factionFor([file.name]), enhancement.detachment)
      detachment.enhancements.set(enhancementKey(en(enhancement.name)), {
        name: en(enhancement.name),
        cost: enhancement.cost == null ? null : String(enhancement.cost),
      })
    }
  }
  return found
}
const kdcDetachments = new Map<string, Detachment>()
for (const faction of kdc) {
  for (const detachment of faction.detachments) {
    const found = collect(kdcDetachments, factionFor(faction.names), en(detachment.name))
    for (const enhancement of faction.enhancements.filter((candidate) => candidate.detachment_id === detachment.id))
      found.enhancements.set(enhancementKey(en(enhancement.name)), {
        name: en(enhancement.name),
        cost: enhancement.cost == null ? null : String(enhancement.cost),
      })
  }
}
const detachmentSides: Record<Source, Map<string, Detachment>> = {
  ours: ourDetachments,
  gdcPin: gdcDetachments(pinCards),
  gdcHead: gdcDetachments(headCards),
  kdc: kdcDetachments,
}
const detachmentKeys = new Set(Object.values(detachmentSides).flatMap((side) => [...side.keys()]))
for (const detachmentKey of detachmentKeys) {
  const sides = Object.fromEntries(Object.entries(detachmentSides).map(([source, side]) => [source, side.get(detachmentKey)])) as Partial<
    Record<Source, Detachment>
  >
  const shown = sides.ours ?? sides.gdcHead ?? sides.gdcPin ?? sides.kdc!
  const presenceValues = Object.fromEntries(Object.entries(sides).map(([source, side]) => [source, side ? PRESENT : ABSENT])) as Values
  const result = finding(shown.faction, shown.name, 'detachments', 'detachment', presenceValues)
  if (result) findings.push(result)
  if (!sides.ours) continue
  const present = Object.entries(sides).filter(([, side]) => side) as [Source, Detachment][]
  const enhancementKeys = new Set(present.flatMap(([, side]) => [...side.enhancements.keys()]))
  for (const key of enhancementKeys) {
    const entries = present.map(([source, side]) => [source, side.enhancements.get(key)] as const)
    const name = entries.find(([, entry]) => entry)![1]!.name
    const exists = Object.fromEntries(entries.map(([source, entry]) => [source, entry ? PRESENT : ABSENT])) as Values
    const listed = finding(shown.faction, shown.name, 'enhancements', name, exists)
    if (listed) {
      findings.push(listed)
      continue
    }
    const costs = Object.fromEntries(entries.map(([source, entry]) => [source, entry!.cost])) as Values
    const cost = finding(shown.faction, shown.name, 'enhancements', `${name}: cost`, costs)
    if (cost) findings.push(cost)
  }
}

const report: DriftReport = {
  generatedAt: new Date().toISOString(),
  revisions: { snapshot: snapshotPointer.id ?? 'materialized', gdcPin: gdcSource.revision, gdcHead, kdcHead },
  findings,
  summary: summarize(findings),
  unmatched,
}
fs.mkdirSync(output, { recursive: true })
fs.writeFileSync(path.join(output, 'drift.json'), `${JSON.stringify({ ...report, counts }, null, 2)}\n`)
fs.writeFileSync(path.join(output, 'drift.md'), renderMarkdown(report))
console.log(
  `${counts.datasheets} datasheets: ${counts.gdcPin} joined to the pinned cards, ${counts.gdcHead} to HEAD, ${counts.kdcById} to 40kdc by id and ${counts.kdcByName} by name`,
)
console.log(`${findings.length} differences, ${unmatched.length} unmatched, in ${((performance.now() - started) / 1000).toFixed(0)}s`)
console.log(path.join(output, 'drift.md'))
console.log(path.join(output, 'drift.json'))

/**
 * Reports, for every datasheet VS Data defines exactly (an options map entry with nothing unmatched) on the current
 * rules version, whether the builder offers a VS Data pick (`vsUnitChoices`, `vsUnitToggles`) what it offers the BSData
 * pick today: the same sizes, the same wargear within reach and as many of each, the Warlord, every allegiance, and as
 * many Enhancements and upgrades under each of the book's Detachments. Counts, unit names and wargear names only. With
 * `--write`, the datasheets that agree, or differ only where VS Data follows the app, become the ones the builder adds as
 * VS Data picks (`src/shared/vsNativeUnits.json`).
 *
 *   pnpm exec tsx scripts/vsDataChoiceParity.ts [catalogue directory] [--list] [--write]
 */
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import rawOptions from '../catalogue/legacy-ids/options.json' with { type: 'json' }
import { legacyOptionsSchema } from '../src/core/legacyIds'
import type { RosterPick } from '../src/core/roster'
import { VS_ALLEGIANCE, VS_ENHANCEMENT, VS_MODELS, VS_UPGRADE, vsFirstPick, vsUnitChoices, vsUnitToggles } from '../src/core/unitChoices'
import { vsDataConstructionSchema, vsDataDefinitions } from '../src/core/vsDataConstruction'
import { carried, type VsRosterUnit } from '../src/core/vsDataRoster'
import { vsFirstFielding, vsResized, vsUnitOptions } from '../src/core/vsDataUnit'
import { readCatalogueComposition } from '../src/server/catalogueComposition'
import { unitIdsIn } from '../src/shared/cataloguePicker'
import { rosterDetachments } from '../src/shared/rosterDetachments'
import { calculateCombat, DEFAULT_COMBAT_OPTIONS } from '../src/core/combat'
import { combatAttacks } from '../src/core/combatScenario'
import { combatUnitTarget } from '../src/core/combatUnit'
import { rosterCombatant } from '../src/shared/rosterCombatRules'
import { calculateRosterPrice, savedRosterPriceInput } from '../src/shared/pricing'
import { loadSnapshot } from './lib/catalogueSnapshotLoad'
import { leaves, legacyIds } from './lib/vsDataRosters'
import { same } from '../src/shared/vsDataModelNames'
import { vsSpelling } from '../src/shared/wargearSpellings'
import { inBook } from '../src/shared/vsDataPoints'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { list: { type: 'boolean', default: false }, write: { type: 'boolean', default: false } },
})
const directory = path.resolve(positionals[0] ?? 'catalogue-data')
const base = readCatalogueComposition(directory)?.editions.find((entry) => entry.base)
if (!base) throw new Error(`${directory} has no base rules version`)
const definitions = vsDataDefinitions(
  vsDataConstructionSchema.parse(
    JSON.parse(fs.readFileSync(path.join(directory, 'summaries', `${base.edition.id}.construction.json`), 'utf8')),
  ),
)
const { catalogue: loaded, rules } = loadSnapshot(directory)
const ids = legacyIds()
const exact = new Map(
  Object.entries(legacyOptionsSchema.parse(rawOptions).units).flatMap(([entryId, entry]) =>
    entry.unmatched.length || !definitions.get('unit', entry.unit) ? [] : [[entryId, entry.unit] as const],
  ),
)
const bsdataDetachments = new Map<string, string[]>()
for (const [bsdata, vs] of Object.entries(ids.detachments)) bsdataDetachments.set(vs, [...(bsdataDetachments.get(vs) ?? []), bsdata])
/** The BSData Detachment a catalogue offers for a VS Data one, of the several rules versions' IDs the frozen map holds. */
const detachmentOf = (catalogueId: string, vs: string) =>
  bsdataDetachments.get(vs)?.find((id) => rosterDetachments(loaded, catalogueId, [id]).chosen.length === 1)

type Priced = NonNullable<ReturnType<typeof calculateRosterPrice>>['units'][number]
const priceOf = (catalogueId: string, pick: RosterPick, detachmentIds: string[] = []): Priced | undefined =>
  calculateRosterPrice(savedRosterPriceInput({ catalogueId, detachmentIds, disposition: null, limit: 2000, picks: [pick] }), loaded, rules)
    ?.units[0]
const price = (catalogueId: string, entryId: string, detachmentIds: string[], models?: number) =>
  priceOf(catalogueId, { entryId, ...(models ? { models } : {}) }, detachmentIds)
/**
 * BSData categories its own checks read that no datasheet prints, which VS Data carries as allies, Detachments and
 * allegiances instead: they say nothing about the datasheet a player sees.
 */
const legalityCategory = (keyword: string) => /^allies/.test(keyword) || ['shadowlegion', 'undivided', 'reconaugury'].includes(keyword)
const keywordsOf = (unit: Priced | undefined) =>
  (unit?.keywords ?? [])
    .map(same)
    .filter((keyword) => !legalityCategory(keyword))
    .toSorted()
    .join()

/** Differences where VS Data follows the app, which leave a datasheet VS-native. */
const LISTED_SIZES = 'sizes the field manual lists'
const SPELLINGS = 'Enhancement spellings'
const accepted = (check: string) => check === LISTED_SIZES || check === SPELLINGS || check.endsWith(' (ruled for VS Data)')

/** How many single-letter edits turn one name into the other. */
function distance(one: string, other: string) {
  let row = Array.from({ length: other.length + 1 }, (_, at) => at)
  for (let i = 1; i <= one.length; i++) {
    const next = [i]
    for (let j = 1; j <= other.length; j++)
      next[j] = Math.min(row[j]! + 1, next[j - 1]! + 1, row[j - 1]! + (one[i - 1] === other[j - 1] ? 0 : 1))
    row = next
  }
  return row[other.length]!
}

/**
 * Differences settled against the rules version's app build, where VS Data's reading stands: a check, the datasheets by
 * name (any book's), and the detail each difference states. Add a row only for a ruling the VS Data gaps work recorded
 * (the K1 and K2 settlements of the VS Data gaps).
 */
const RULED: { check: string; units: RegExp; detail: RegExp; why: string }[] = [
  {
    check: 'warlord',
    units: /^(Company Heroes|Rein and Raus)$/,
    detail: /VS Data offers it/,
    why: 'neither the app nor the Legends sheet bars it from the Warlord role',
  },
  {
    check: 'warlord',
    units: /.*/,
    detail: /BSData offers it, VS Data withholds it/,
    why: 'the core Select Warlord step takes a unit of the army faction, and the app flags Harlequins and ties the Ynnari to Yvraine or the Yncarne',
  },
  {
    check: 'enhancements',
    units: /.*/,
    detail:
      /^(Gladius Task Force: only BSData standardoftheemperorascendant|Shadow Legion: only BSData [a-z, ]+|Pactbound Zealots: only BSData talismanofburningblood only VS Data eyeoftzeentch|Cabal of Chaos: only BSData [a-z, ]+|[A-Za-z ’'-]+: only VS Data (murderforgedentity|furiousassault|leonineferocity, lightningdescent|reconstar|deepeningmadness|immovableconquerors|gunneryhonours, redoubtablemachinespirit|artificersarcophagus, venerablechampion))$/,
    why: 'VS Data follows the app: the Standard needs ANCIENT, Shadow Legion admits no Daemon Prince, Pactbound psykers bear no Khorne mark, Cabal of Chaos follows the allegiance taken, and these Detachment upgrades take non-Characters',
  },
  {
    check: 'wargear counts',
    units:
      /^(Chaos Predator.*|Forgefiend|Maulerfiend|Hell Blade|Foetid Bloat-Drone|Plagueburst Crawler|Venerable Dreadnought|Baal Predator|Stormfang Gunship|Contemptor-Achillus Dreadnought|Corvus Blackstar|Stormraven Gunship|Leman Russ.*|Macharius.*|Malcador.*|Rogal Dorn.*|Arkurian Stormhammer|Dominus Armoured Siege Bombard|Gorgon Heavy Transport|Stormblade|Valkyrie|Valkyrie Sky Talon|Vendetta Gunship|Vulture Gunship|Acastus Knight Porphyrion|Astraeus|Crimson Hunter|Razorwing Jetfighter|Voidraven Bomber|Monolith|Seraptek Heavy Construct|Tesseract Ark|AX-1-0 Tiger Shark|Devilfish|Hammerhead Gunship|Sky Ray Gunship|Tiger Shark|Tx42 Piranha|Cerberus|Falchion|Mastodon|Typhon|Sicaran|Mortifiers|Lifta Wagon)$/,
    detail: /.*/,
    why: 'the app prints a multi-weapon choice, as "2 heavy bolters", that the BSData reach counts as one selection',
  },
  {
    check: 'sizes',
    units:
      /^(Chaos Spawn|Canis Rex|Webway Gate|Wall of Martyrs Defence Line|Accursed Cultists|Shadow Spectres|Neurogaunts|Beast Snagga Boyz|Squighog Boyz)$/,
    detail: /.*/,
    why: 'VS Data takes the unit composition the app or the PDF prints',
  },
  {
    check: 'wargear',
    units:
      /^(Captain in Gravis Armour|Azrael|Commissar Graves|Hemlock Wraithfighter|Hornet|Karandras|Death Jester|Shadowseer|Solitaire|Troupe Master|Macharius Omega|Commander Shadowsun|Soul Grinder|Canis Rex|The Twin Lance|Daemonifuge|Lady Malys|Goliath Truck|Hybrid Metamorphs|Tesseract Vault|Dimachaeron)$/,
    detail: /.*/,
    why: 'the app prints this wargear one-sided, or spells it as VS Data does',
  },
  {
    check: 'allegiance',
    units: /^Soul Grinder$/,
    detail: /.*/,
    why: 'the app prints one Soul Grinder datasheet per god, each with its own allegiance',
  },
]
const RULED_SUFFIX = ' (ruled for VS Data)'

const differences = new Map<string, Map<string, string[]>>()
/** Each check's differences, by VS Data unit ID; one a ruling settles is filed apart. */
const differ = (check: string, unit: string, detail: string) => {
  const name = definitions.get('unit', unit)?.name ?? unit
  const ruled = RULED.some((row) => row.check === check && row.units.test(name) && row.detail.test(detail))
  const filed = ruled ? `${check}${RULED_SUFFIX}` : check
  const byUnit = differences.get(filed) ?? new Map<string, string[]>()
  differences.set(filed, byUnit)
  byUnit.set(unit, [...(byUnit.get(unit) ?? []), detail])
}
const checked = new Map<string, number>()
const count = (check: string) => checked.set(check, (checked.get(check) ?? 0) + 1)
/** An Enhancement's name, without the "(Upgrade)" or "(Aura)" one source prints and the other leaves out. */
const enhancementName = (name: string) => same(name.replace(/\((upgrade|aura)\)/gi, ''))
const special = (choice: Priced['choices'][number]) => 'kind' in choice && Boolean(choice.kind)

/**
 * What a unit can reach: every wargear it carries or can take, and for each it can only take, the most one choice gives
 * it, which is what the player meets on one stepper. Sums across choices would count a room several share more than once.
 */
type Reach = { names: Set<string>; most: Map<string, number> }
const reached = (): Reach => ({ names: new Set(), most: new Map() })
const offer = (reach: Reach, key: string, n: number) => {
  reach.names.add(key)
  reach.most.set(key, Math.max(reach.most.get(key) ?? 0, n))
}

/** The BSData unit's reach, by VS Data's spelling where it has one. Allegiances are not wargear. */
function bsdataReach(unit: Priced, vsKeys: ReadonlySet<string>, allegiances: ReadonlySet<string>) {
  const reach = reached()
  const held = new Set(unit.wargear.map((piece) => vsSpelling(piece.name, vsKeys)))
  for (const key of held) reach.names.add(key)
  for (const choice of unit.choices.filter((candidate) => !special(candidate))) {
    const total = new Map<string, number>()
    for (const option of choice.options) {
      if (allegiances.has(same(option.name))) continue
      const pieces = (option as { pieceCounts?: { name: string; count: number }[] }).pieceCounts
      const counts = pieces?.length
        ? pieces.map((piece) => ({ ...piece, count: piece.count / Math.max(1, option.count) }))
        : [{ name: option.name, count: 1 }]
      for (const piece of counts) {
        const key = vsSpelling(piece.name, vsKeys)
        total.set(key, Math.max(total.get(key) ?? 0, piece.count * option.max))
      }
    }
    for (const [key, n] of total)
      if (held.has(key)) reach.names.add(key)
      else offer(reach, key, Math.min(n, choice.room))
  }
  return reach
}

/** The VS Data unit's reach. */
function vsReach(picked: VsRosterUnit) {
  const reach = reached()
  const keysOf = (id: string) => {
    const found = new Map<string, number>()
    leaves(definitions, id, 1, found)
    return found
  }
  const held = new Set([...carried(definitions, picked)].flatMap(([id, n]) => (n > 0 ? [...keysOf(id).keys()] : [])))
  for (const key of held) reach.names.add(key)
  for (const option of vsUnitOptions(definitions, picked))
    for (const choice of option.choices)
      for (const [key, k] of keysOf(choice.id))
        if (held.has(key)) reach.names.add(key)
        else offer(reach, key, k * choice.most)
  return reach
}

const NATIVE_FILE = path.join(import.meta.dirname, '../src/shared/vsNativeUnits.json')
const bookOf = (catalogueId: string) => ids.books[catalogueId.slice(catalogueId.indexOf('~') + 1)]
// A datasheet is compared in its own book's catalogue where one lists it, as an ally's Detachments are not the roster's.
const listing = new Map<string, string>()
// Legends and Crucible datasheets stay with the catalogue's checks (`vsDataChecks`), so the builder adds them from BSData.
const matchedPlay = new Set(loaded.factions.flatMap((faction) => unitIdsIn(loaded, faction.id).flatMap((id) => exact.get(id) ?? [])))
for (const faction of loaded.factions) {
  const book = bookOf(faction.id)
  if (!book) continue
  for (const entryId of unitIdsIn(loaded, faction.id, { nonMatchedPlay: true })) {
    const unitId = inBook(exact, faction.id, entryId)
    if (!unitId) continue
    const own = definitions.get('unit', unitId)!.data.faction === book
    if (!listing.has(entryId) || own) listing.set(entryId, faction.id)
  }
}

// The defender every attacker is measured against, as the simulator fields it.
const marines = loaded.factions.find((faction) => faction.name === 'Imperium - Adeptus Astartes - Space Marines')!.id
const intercessors = [...loaded.index.definitions.values()].find(
  (entry) => entry.name === 'Intercessor Squad' && loaded.vsRoster?.units[entry.id],
)!.id
const defender = rosterCombatant(loaded, rules, {
  catalogueId: marines,
  detachmentIds: [],
  picks: [{ entryId: intercessors }],
  pickIndex: 0,
})!
const target = combatUnitTarget({ sheet: defender.selected, carriers: defender.carriers, models: defender.models }).target!

let units = 0
const compared = new Set<string>()
for (const [entryId, catalogueId] of listing) {
  {
    const faction = { id: catalogueId }
    const book = bookOf(catalogueId)!
    const unitId = inBook(exact, catalogueId, entryId)!
    const first = vsFirstFielding(definitions, unitId)
    const sizes = definitions.get('unit', unitId)!.data.sizes
    const largest = Math.max(...sizes)
    const plain = price(faction.id, entryId, [])
    if (!plain) {
      differ('builds', unitId, 'BSData does not price it')
      continue
    }
    units++
    compared.add(unitId)

    count('sizes')
    const bsSizes = plain.size.options ?? Array.from({ length: plain.size.max - plain.size.min + 1 }, (_, at) => plain.size.min + at)
    if (bsSizes.join() !== sizes.join()) {
      // BSData's catalogue admits every size between the smallest and largest; the field manual prices only some of them.
      const listed = sizes.every((size) => bsSizes.includes(size)) && sizes[0] === bsSizes[0] && sizes.at(-1) === bsSizes.at(-1)
      differ(listed ? LISTED_SIZES : 'sizes', unitId, `BSData ${bsSizes.join('/')}, VS Data ${sizes.join('/')}`)
    }

    count('wargear')
    const big = price(faction.id, entryId, [], largest) ?? plain
    const vsBig = vsResized(definitions, first, largest)
    const vs = vsReach(vsBig)
    const allegianceNames = new Set(
      (definitions.get('unit', unitId)!.data.allegiances ?? []).flatMap((entry) =>
        entry.choices.map((id) => same(definitions.get('allegiance', id)?.name ?? id)),
      ),
    )
    const bs = bsdataReach(big, vs.names, allegianceNames)
    for (const key of new Set([...bs.names, ...vs.names])) {
      if (!vs.names.has(key)) differ('wargear', unitId, `only BSData offers ${key}`)
      else if (!bs.names.has(key)) differ('wargear', unitId, `only VS Data offers ${key}`)
    }
    count('wargear counts')
    for (const [key, n] of bs.most)
      if (vs.most.has(key) && vs.most.get(key) !== n)
        differ('wargear counts', unitId, `${key}: BSData up to ${n}, VS Data up to ${vs.most.get(key)} at ${largest}`)

    // VS Data's options grant no keywords yet, so a datasheet whose BSData keywords follow its wargear keeps BSData.
    count('keywords')
    const { unit: _unit, ...firstPick } = vsFirstPick(definitions, unitId)
    const vsKeywords = keywordsOf(priceOf(faction.id, { entryId, vs: { models: {}, options: {}, ...firstPick } }))
    if (vsKeywords !== keywordsOf(plain)) differ('keywords', unitId, `BSData ${keywordsOf(plain)}, VS Data ${vsKeywords}`)
    // A VS pick's datasheet (characteristics and abilities) is read from its catalogue tree at the default loadout, so a
    // datasheet whose wargear changes them stays BSData's until that tree follows VS Data's selections.
    count('datasheet')
    const sheetOf = (pick: RosterPick) => {
      const sheet = rosterCombatant(loaded, rules, { catalogueId: faction.id, detachmentIds: [], picks: [pick], pickIndex: 0 })?.selected
      if (!sheet) return 'none'
      const characteristics = sheet.profiles
        .filter((profile) => profile.type !== 'Ranged Weapons' && profile.type !== 'Melee Weapons')
        .map((profile) => `${profile.name}:${profile.values.map((value) => value.value).join('/')}`)
      return JSON.stringify([characteristics.toSorted(), sheet.abilities.map((ability) => ability.name).toSorted()])
    }
    const plainSheet = sheetOf({ entryId })
    const optionPicks = plain.choices
      .filter((choice) => !special(choice))
      .flatMap((choice) =>
        choice.options
          .filter((option) => option.count === 0 && option.max > 0)
          .map((option) => ({
            name: option.name,
            pick:
              choice.room > 1
                ? ({ entryId, spreads: { [choice.key]: { [option.id]: 1 } } } satisfies RosterPick)
                : ({ entryId, choices: { [choice.key]: option.id } } satisfies RosterPick),
          })),
      )
    const granting = optionPicks.flatMap(({ name: option, pick }) =>
      keywordsOf(priceOf(faction.id, pick)) === keywordsOf(plain) ? [] : [option],
    )
    if (granting.length) differ('keywords', unitId, `BSData keywords change with ${granting.join(', ')}`)
    const changing = optionPicks.flatMap(({ name: option, pick }) => (sheetOf(pick) === plainSheet ? [] : [option]))
    if (changing.length) differ('datasheet', unitId, `characteristics or abilities change with ${changing.join(', ')}`)

    // The simulator fields a VS pick by VS Data's carriers, so each weapon has to find its profile as the catalogue's does.
    count('simulator')
    const damage = (pick: RosterPick) => {
      const unit = rosterCombatant(loaded, rules, { catalogueId: faction.id, detachmentIds: [], picks: [pick], pickIndex: 0 })
      if (!unit) return 'none'
      const attacker = { sheet: unit.selected, carriers: unit.carriers, models: unit.models }
      const attacks = combatAttacks(attacker, { keywords: [], rules: [] }, {}, { ranged: [], melee: [] })
      return (['ranged', 'melee'] as const)
        .map((phase) => {
          const attack = attacks[phase].base
          if (!attack) return `${phase} none`
          const mean = calculateCombat({ ...attack, target, options: { ...DEFAULT_COMBAT_OPTIONS, phase } }).meanDamage
          return `${phase} ${mean.toFixed(2)}`
        })
        .join(', ')
    }
    const bsDamage = damage({ entryId })
    const vsDamage = damage({ entryId, vs: { models: {}, options: {}, ...firstPick } })
    if (bsDamage !== vsDamage) differ('simulator', unitId, `BSData ${bsDamage}, VS Data ${vsDamage} against Intercessors`)

    count('warlord')
    const roster = { faction: book, detachments: [] as string[] }
    const vsWarlord = vsUnitToggles(definitions, first, { roster }).length > 0
    const bsWarlord = plain.toggles.some((toggle) => toggle.name === 'Warlord')
    if (vsWarlord !== bsWarlord)
      differ('warlord', unitId, `BSData ${bsWarlord ? 'offers' : 'withholds'} it, VS Data ${vsWarlord ? 'offers' : 'withholds'} it`)

    if (vsUnitChoices(definitions, first).some((choice) => choice.key === VS_MODELS))
      checked.set('models', (checked.get('models') ?? 0) + 1)

    const own = new Set([book, definitions.get('faction', book)?.data.parent])
    const detachments = definitions.all('detachment').filter((detachment) => own.has(detachment.data.faction))
    const offersAllegiance = Boolean(definitions.get('unit', unitId)!.data.allegiances?.length)
    for (const detachment of detachments) {
      const bsdataId = detachmentOf(faction.id, detachment.id)
      const context = { roster: { faction: book, detachments: [detachment.id] } }
      const choices = vsUnitChoices(definitions, vsFirstPick(definitions, unitId, context), context)
      const vsEnhancements = choices
        .filter((choice) => choice.key === VS_ENHANCEMENT || choice.key === VS_UPGRADE)
        .flatMap((choice) => choice.options.map((option) => enhancementName(option.name)))
      const allegiances = choices.find((choice) => choice.key === VS_ALLEGIANCE)?.options.map((option) => same(option.name)) ?? []
      if (!vsEnhancements.length && !allegiances.length && !(offersAllegiance && bsdataId)) continue
      if (!bsdataId) {
        differ('enhancements', unitId, `${detachment.name} has no BSData Detachment`)
        continue
      }
      const priced = price(faction.id, entryId, [bsdataId])
      if (!priced) continue
      count('enhancements')
      const bsEnhancements = priced.choices
        .filter(special)
        .flatMap((choice) => choice.options.map((option) => enhancementName(option.name)))
        .filter((option) => !allegiances.includes(option))
      const onlyBs = bsEnhancements.filter((option) => !vsEnhancements.includes(option))
      const onlyVs = vsEnhancements.filter((option) => !bsEnhancements.includes(option))
      const spelled = onlyBs.flatMap((printed) => {
        const spelling = onlyVs.find((candidate) => distance(printed, candidate) <= 3)
        return spelling ? [`${printed} / ${spelling}`] : []
      })
      if (spelled.length) differ(SPELLINGS, unitId, `${detachment.name}: ${spelled.join(', ')}`)
      if (onlyBs.length > spelled.length || onlyVs.length > spelled.length)
        differ(
          'enhancements',
          unitId,
          `${detachment.name}:${onlyBs.length ? ` only BSData ${onlyBs.join(', ')}` : ''}${onlyVs.length ? ` only VS Data ${onlyVs.join(', ')}` : ''}`,
        )
      if (!offersAllegiance) continue
      count('allegiance')
      const bsAllegiances = new Set(
        priced.choices.flatMap((choice) =>
          choice.options.flatMap((option) => {
            const named = same(option.name)
            return allegiances.filter((allegiance) => named === allegiance || named.endsWith(allegiance))
          }),
        ),
      )
      if (bsAllegiances.size !== allegiances.length)
        differ('allegiance', unitId, `${detachment.name}: BSData ${bsAllegiances.size}, VS Data ${allegiances.length}`)
    }
  }
}

console.log(`${units} exactly defined datasheets compared (of ${exact.size} mapped exactly)`)
for (const [check, total] of [...checked].filter(([name]) => name !== 'models')) {
  const found = differences.get(check)?.size ?? 0
  console.log(`${check}: ${total - found} of ${total} agree`)
}
const differing = new Set([...differences].flatMap(([check, byUnit]) => (accepted(check) ? [] : [...byUnit.keys()])))
console.log(`${units - differing.size} of ${units} agree on every check, or differ only where VS Data follows the app`)
console.log(`${checked.get('models') ?? 0} datasheets divide their size between freely counted models`)
for (const [check, byUnit] of differences) {
  if (!checked.has(check)) console.log(`${check}: ${byUnit.size} datasheets`)
  if (!values.list) continue
  for (const [unit, details] of byUnit) console.log(`  ${check} | ${definitions.get('unit', unit)!.name}: ${details.join('; ')}`)
}

// The datasheets the builder fields by VS Data: every matched-play one compared that differs only where VS Data follows the app.
if (values.write) {
  const native = [...compared]
    .filter((unit) => !differing.has(unit) && matchedPlay.has(unit) && !definitions.get('unit', unit)!.data.legends)
    .toSorted()
  fs.writeFileSync(NATIVE_FILE, `${JSON.stringify(native, null, 2)}\n`)
  console.log(`wrote ${native.length} datasheets to ${path.relative(process.cwd(), NATIVE_FILE)}`)
}

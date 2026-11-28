/**
 * Reports, for every datasheet the options map reads as a VS Data unit on the current rules version, whether the builder offers a VS Data pick (`vsUnitChoices`, `vsUnitToggles`) what it offers the BSData
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
import rawUnits from '../catalogue/legacy-ids/units.json' with { type: 'json' }
import keywordRulings from './vsDataKeywordRulings.json' with { type: 'json' }
import { legacyIdsSchema, legacyOptionsSchema } from '../src/core/legacyIds'
import type { RosterPick } from '../src/core/roster'
import { VS_ALLEGIANCE, VS_ENHANCEMENT, VS_MODELS, VS_UPGRADE, vsFirstPick, vsUnitChoices, vsUnitToggles } from '../src/core/unitChoices'
import { vsDataConstructionSchema, vsDataDefinitions } from '../src/core/vsDataConstruction'
import { carried, modelCounts, type VsRosterUnit } from '../src/core/vsDataRoster'
import { vsFirstFielding, vsResized, vsUnitOptions, vsWithChoice } from '../src/core/vsDataUnit'
import { readCatalogueComposition } from '../src/server/catalogueComposition'
import { unitIdsIn } from '../src/shared/cataloguePicker'
import { rosterDetachments } from '../src/shared/rosterDetachments'
import { calculateCombat, DEFAULT_COMBAT_OPTIONS } from '../src/core/combat'
import { combatAttacks } from '../src/core/combatScenario'
import { combatUnitTarget } from '../src/core/combatUnit'
import { combatKeyword, normalizeCombatKeyword, WEAPON_ABILITY_KINDS } from '../src/core/combatKeywords'
import { rosterCombatant } from '../src/shared/rosterCombatRules'
import { calculateRosterPrice, savedRosterPriceInput } from '../src/shared/pricing'
import { loadSnapshot } from './lib/catalogueSnapshotLoad'
import { legacyIds } from './lib/vsDataRosters'
import { same } from '../src/shared/vsDataModelNames'
import { leaves, vsSpelling } from '../src/shared/wargearSpellings'
import { inBook } from '../src/shared/vsDataPoints'
import { vsShellIn } from '../src/shared/vsDataShell'

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
const allegianceOf = legacyIdsSchema.parse(rawUnits).allegiances ?? {}
// A catalogue choice the map leaves unmatched only keeps an import of it a catalogue pick (`legacyOptionSelections`), so
// what the builder offers is compared for every mapped datasheet.
const mapped = new Map(
  Object.entries(legacyOptionsSchema.parse(rawOptions).units).flatMap(([entryId, entry]) =>
    definitions.get('unit', entry.unit) ? [[entryId, entry.unit] as const] : [],
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
 * BSData categories its own checks read that no datasheet prints, which VS Data carries as allies, a Detachment's
 * conditional keyword (Shadow Legion) and allegiances (Undivided) instead: they say nothing about the datasheet a player sees.
 */
const legalityCategory = (keyword: string) => keyword.startsWith('allies') || ['shadowlegion', 'undivided'].includes(keyword)
const keywordsOf = (unit: Priced | undefined) =>
  [...new Set((unit?.keywords ?? []).map(same).filter((keyword) => !legalityCategory(keyword)))].toSorted().join()

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
 * name (any book's) or VS Data unit ID (one book's), and the detail each difference states. Add a row only for a ruling the VS Data gaps work recorded
 * (the K1 and K2 settlements of the VS Data gaps).
 */
const RULED: { check: string; units: RegExp | ReadonlySet<string>; detail: RegExp; why: string }[] = [
  {
    check: 'keywords',
    // By VS Data unit ID: the datasheets O reviewed, apart from the Cybernetica Datasmith (vs-data#229) and the Daemonic Herald.
    units: new Set(keywordRulings),
    detail: /.*/,
    why: 'VS Data follows the app (build 995): its plural and name keywords stand, and Recon Augury, Harlequin Allies and the categories BSData gives wargear such as Terminator Armour are no keywords any source prints',
  },
  {
    check: 'warlord',
    units: /^(Company Heroes|Rein and Raus|Ravenwing Command Squad)$/,
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
    check: 'wargear counts',
    units: /^Sword Brethren Squad$/,
    detail: /^hand-flamer:/,
    why: 'the app (build 995) gives Sword Brethren 2 hand flamers per 4 models',
  },
  {
    check: 'wargear counts',
    units: /^Death Company Marines with Jump Packs$/,
    detail: /^(plasma-pistol|inferno-pistol|hand-flamer):/,
    why: 'the app (build 995) gives Death Company 2 plasma pistols and 1 inferno pistol or hand flamer per 5 models',
  },
  {
    check: 'wargear counts',
    units: /^Tyranid Warriors with Ranged Bio-weapons$/,
    detail: /^(venom-cannon|barbed-strangler):/,
    why: 'the app (build 995) gives Tyranid Warriors 1 of each per 3 models',
  },
  {
    check: 'wargear counts',
    units: /^Seraphim Squad$/,
    detail: /^ministorum-hand-flamer:/,
    why: 'the app (build 995) gives Seraphim 8 hand flamers at 10 models',
  },
  {
    check: 'wargear counts',
    units: /^Overlord$/,
    detail: /^resurrection-orb:/,
    why: 'the app (build 995) gives an Overlord one resurrection orb, with the staff or voidscythe swap',
  },
  {
    check: 'wargear counts',
    units: /^(Reaver Titan|Warbringer Nemesis Titan|Warlord Titan|Warhound Titan|Armiger Moirax|War Dog Moirax)$/,
    detail: /.*/,
    why: 'the app (build 995) arms each arm with one weapon, the same on both arms allowed',
  },
  {
    check: 'wargear',
    units: /^Wulfen$/,
    detail: /^only VS Data offers death-totem$/,
    why: 'the card gives Wulfen a death totem',
  },
  {
    check: 'wargear',
    units: /^Scourges with (Heavy Weapons|Shardcarbines)$/,
    detail:
      /^only (VS Data offers (power-weapon|splinter-pistol|blast-pistol)|BSData offers 1-(blast|splinter)-pistol-and-1-power-weapon)$/,
    why: 'the card gives the Scourges’ Solarite their pistol and power weapon apart',
  },
  {
    check: 'wargear',
    units: /^Lieutenant$/,
    detail: /^only VS Data offers storm-shield$/,
    why: 'the card gives a Lieutenant a storm shield only with the neo-volkite pistol and master-crafted power weapon',
  },
  {
    check: 'wargear',
    units: /^Wulfen with Storm Shields$/,
    detail: /^only (BSData offers storm-shield|VS Data offers death-totem)$/,
    why: 'the card gives these Wulfen a death totem and no shield wargear: their 4+ invulnerable save is on the datasheet',
  },
  {
    check: 'wargear',
    units: /^black-templars\.emperors-champion$/,
    detail:
      /^only BSData offers (master-of-arms|epitome-of-piety|instrument-of-the-emperor|adaptable-executioner|inspirational-fighter|front-line-crusader)$/,
    why: 'no app build prints the Anointed Emperor’s Champion’s vows: the card gives a black sword and bolt pistol',
  },
  {
    check: 'keywords',
    units: /^black-templars\.emperors-champion$/,
    detail: /.*/,
    why: 'the Emperor’s Champion’s own BSData entry prints VS Data’s keywords; only its Anointed copy differs',
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
  {
    check: 'simulator',
    units:
      /^(aeldari\.falcon|space-marines\.relic-razorback|tau-empire\.kroot-war-shaper|tau-empire\.kroot-lone-spear|imperial-knights\.canis-rex|thousand-sons\.chaos-spawn|necrons\.canoptek-tomb-crawlers|world-eaters\.chaos-rhino|chaos-space-marines\.havocs|death-guard\.helbrute|titan-legions\.warhound-titan|imperial-knights\.armiger-moirax|chaos-knights\.war-dog-moirax|tau-empire\.taunar-supremacy-armour)$/,
    // A weapon scoring nothing is the simulator missing its profile, not a loadout, so that stays a difference.
    detail: /^(?!.*\bnone\b)/,
    why: 'VS Data starts these on the default loadout the app (build 995) prints, and fires both of a Tomb Crawler’s twin gauss reapers, so their damage differs from BSData’s',
  },
]
/**
 * Datasheets every check passes that a VS Data release still over-admits in a way the parity can't see, by VS Data unit
 * ID, so the builder keeps adding them as the catalogue builds them until a release with the fix is pinned.
 */
const HELD_BACK = new Map([
  [
    'dark-angels.ravenwing-black-knights',
    'every Black Knight may swap its plasma talon for a grenade launcher, where BSData keeps at least two talons in six',
  ],
])
const RULED_SUFFIX = ' (ruled for VS Data)'

const differences = new Map<string, Map<string, string[]>>()
/** Each check's differences, by VS Data unit ID; one a ruling settles is filed apart. */
const differ = (check: string, unit: string, detail: string) => {
  const name = definitions.get('unit', unit)?.name ?? unit
  const ruled = RULED.some(
    (row) =>
      row.check === check &&
      (row.units instanceof RegExp ? row.units.test(name) || row.units.test(unit) : row.units.has(unit)) &&
      row.detail.test(detail),
  )
  const filed = ruled ? `${check}${RULED_SUFFIX}` : check
  const byUnit = differences.get(filed) ?? new Map<string, string[]>()
  differences.set(filed, byUnit)
  byUnit.set(unit, [...(byUnit.get(unit) ?? []), detail])
}
const checked = new Map<string, number>()
const count = (check: string) => checked.set(check, (checked.get(check) ?? 0) + 1)
/** Whether a rule is a weapon keyword, as Blast, Anti-fly 2+ or Devastating Wounds, rather than an ability of the unit's. */
const weaponRule = (name: string) => {
  const written = normalizeCombatKeyword(name)
  return combatKeyword(name) !== null || WEAPON_ABILITY_KINDS.some((kind) => written === kind || written.startsWith(`${kind}-`))
}
/** An Enhancement's name, without the "(Upgrade)" or "(Aura)", in either brackets, one source prints and the other leaves out. */
const enhancementName = (name: string) => same(name.replace(/[([](upgrade|aura)[)\]]/gi, ''))
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
  // BSData holds a required allegiance, as a Daemon Prince's Khorne, as the wargear its tree starts with.
  const held = new Set(unit.wargear.flatMap((piece) => (allegiances.has(same(piece.name)) ? [] : [vsSpelling(piece.name, vsKeys)])))
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
// Legends and Crucible datasheets are built from BSData, as most stay with the catalogue's checks (`vsDataChecks`).
const matchedPlay = new Set(loaded.factions.flatMap((faction) => unitIdsIn(loaded, faction.id).flatMap((id) => mapped.get(id) ?? [])))
for (const faction of loaded.factions) {
  const book = bookOf(faction.id)
  if (!book) continue
  for (const entryId of unitIdsIn(loaded, faction.id, { nonMatchedPlay: true })) {
    const unitId = inBook(mapped, faction.id, entryId)
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
    const unitId = inBook(mapped, catalogueId, entryId)!
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
    // A catalogue datasheet that stands for one of a VS Data unit's allegiances, as one Soul Grinder datasheet per god does,
    // is compared with the VS pick taking that allegiance.
    const { unit: _unit, ...firstPick } = vsFirstPick(definitions, unitId, {}, allegianceOf[entryId])
    // A unit has all its models' keywords, so one VS Data prints on a fielded model and BSData leaves off the unit agrees.
    const counts = modelCounts(definitions, { unit: unitId, ...firstPick })
    const fromModels = new Set(
      definitions.modelsOf(unitId).flatMap((model) => ((counts.get(model.id) ?? 0) > 0 ? (model.data.keywords ?? []).map(same) : [])),
    )
    const bsKeywords = keywordsOf(plain)
    const vsKeywords = keywordsOf(priceOf(faction.id, { entryId, vs: { models: {}, options: {}, ...firstPick } }))
      .split(',')
      .filter((keyword) => !fromModels.has(keyword) || bsKeywords.split(',').includes(keyword))
      .join()
    if (vsKeywords !== bsKeywords) differ('keywords', unitId, `BSData ${bsKeywords}, VS Data ${vsKeywords}`)
    // A VS pick's datasheet (characteristics and abilities) is read from its catalogue tree, which follows the pick's VS
    // Data choices through the options map (`vsShellSpreads`). Each choice's datasheet is compared with the catalogue
    // option the map files it under, and a datasheet whose wargear changes it through a choice the map can't place stays
    // BSData's.
    count('datasheet')
    const sheetOf = (pick: RosterPick) => {
      const sheet = rosterCombatant(loaded, rules, { catalogueId: faction.id, detachmentIds: [], picks: [pick], pickIndex: 0 })?.selected
      if (!sheet) return 'none'
      const characteristics = sheet.profiles
        .filter((profile) => profile.type !== 'Ranged Weapons' && profile.type !== 'Melee Weapons')
        .map((profile) => `${profile.name}:${profile.values.map((value) => value.value).join('/')}`)
      // A weapon keyword BSData links to a weapon's option as an ability is a core rule VS Data keeps on the weapon's profile.
      const abilities = sheet.abilities.flatMap((ability) => (weaponRule(ability.name) ? [] : [ability.name]))
      return JSON.stringify([characteristics.toSorted(), abilities.toSorted()])
    }
    const plainSheet = sheetOf({ entryId })
    const choiceAt = new Map(plain.choices.map((choice) => [choice.key, choice]))
    const catalogueOption = (key: string, optionId: string, name: string) => ({
      name,
      pick:
        (choiceAt.get(key)?.room ?? 1) > 1
          ? ({ entryId, spreads: { [key]: { [optionId]: 1 } } } satisfies RosterPick)
          : ({ entryId, choices: { [key]: optionId } } satisfies RosterPick),
    })
    const optionPicks = plain.choices
      .filter((choice) => !special(choice))
      .flatMap((choice) =>
        choice.options
          .filter((option) => option.count === 0 && option.max > 0)
          .map((option) => catalogueOption(choice.key, option.id, option.name)),
      )
    // A catalogue option that is one of the unit's allegiances, as a Mark of Chaos is, gives its keywords through VS Data's
    // allegiance, not its wargear.
    const sworn = (option: string) => [...allegianceNames].some((name) => same(option) === name || same(option).endsWith(name))
    const granting = optionPicks.flatMap(({ name: option, pick }) =>
      sworn(option) || keywordsOf(priceOf(faction.id, pick)) === keywordsOf(plain) ? [] : [option],
    )
    if (granting.length) differ('keywords', unitId, `BSData keywords change with ${granting.join(', ')}`)
    const wargearChanges = optionPicks.some(({ pick }) => sheetOf(pick) !== plainSheet)
    const shell = vsShellIn(loaded.vsRoster, entryId)
    const vsPickOf = (unit: VsRosterUnit): RosterPick => ({
      entryId,
      vs: { ...firstPick, models: unit.models ?? {}, options: unit.options ?? {} },
    })
    const changing: string[] = []
    if (sheetOf(vsPickOf(first)) !== plainSheet) changing.push('the default loadout')
    for (const option of vsUnitOptions(definitions, first))
      for (const choice of option.choices) {
        const name = definitions.get('wargear', choice.id)?.name ?? choice.id
        const standsFor = shell?.[option.id]?.[choice.id]?.[0]
        if (!standsFor) {
          if (wargearChanges) changing.push(`${name}, which no catalogue option stands for`)
          continue
        }
        const taken = vsWithChoice(definitions, first, option.id, { [choice.id]: 1 })
        if (taken && sheetOf(vsPickOf(taken)) !== sheetOf(catalogueOption(...standsFor, name).pick)) changing.push(name)
      }
    // Choices taken together, or one at its most, can crowd each other out of the catalogue tree, where a group holds fewer
    // than VS Data allows, so each must keep the abilities it gives alone.
    const abilitiesIn = (unit: VsRosterUnit) => {
      const sheet = sheetOf(vsPickOf(unit))
      return sheet === 'none' ? [] : (JSON.parse(sheet) as [string[], string[]])[1]
    }
    const unarmed = abilitiesIn(first)
    const takes = vsUnitOptions(definitions, first).flatMap((option) =>
      option.choices.map((choice) => {
        const once = vsWithChoice(definitions, first, option.id, { [choice.id]: 1 })
        return {
          option: option.id,
          choice: choice.id,
          most: choice.most,
          once,
          gives: abilitiesIn(once).filter((ability) => !unarmed.includes(ability)),
        }
      }),
    )
    const lost = (unit: VsRosterUnit, gives: readonly string[]) => {
      const kept = abilitiesIn(unit)
      return gives.filter((ability) => !kept.includes(ability))
    }
    for (const take of takes) {
      const name = definitions.get('wargear', take.choice)?.name ?? take.choice
      const missing = take.most > 1 ? lost(vsWithChoice(definitions, first, take.option, { [take.choice]: take.most }), take.gives) : []
      if (missing.length) changing.push(`${name} at ${take.most}, which loses ${missing.join(', ')}`)
    }
    takes.forEach((one, at) =>
      takes.slice(at + 1).forEach((other) => {
        // Two choices of one option are taken together in it, as a Tankbusta squad's pulsa rokkit beside a busta rokkit launcha.
        const both =
          one.option === other.option
            ? vsWithChoice(definitions, first, one.option, { [one.choice]: 1, [other.choice]: 1 })
            : vsWithChoice(definitions, one.once, other.option, { [other.choice]: 1 })
        const missing = lost(both, [...one.gives, ...other.gives])
        if (missing.length) changing.push(`${one.choice} with ${other.choice}, which loses ${missing.join(', ')}`)
      }),
    )
    if (changing.length) differ('datasheet', unitId, `characteristics or abilities differ with ${changing.join(', ')}`)

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
      const picked = vsFirstPick(definitions, unitId, context)
      const choices = vsUnitChoices(definitions, picked, context)
      // A unit that must take an allegiance starts unsworn, so its Enhancements are measured as it holds the first one, as
      // BSData's default offers them.
      const required = choices.find((choice) => choice.key === VS_ALLEGIANCE && !choice.optional)?.options[0]?.id
      const measured = required ? vsUnitChoices(definitions, { ...picked, allegiance: required }, context) : choices
      const vsEnhancements = measured
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

console.log(`${units} mapped datasheets compared (of ${mapped.size} mapped)`)
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
  for (const [unit, details] of byUnit) console.log(`  ${check} | ${definitions.get('unit', unit)!.name} (${unit}): ${details.join('; ')}`)
}

// The datasheets the builder fields by VS Data: every matched-play one compared that differs only where VS Data follows the app.
if (values.write) {
  const native = [...compared]
    .filter((unit) => !differing.has(unit) && matchedPlay.has(unit) && !definitions.get('unit', unit)!.data.legends && !HELD_BACK.has(unit))
    .toSorted()
  for (const [unit, why] of HELD_BACK) console.log(`held back ${unit}: ${why}`)
  fs.writeFileSync(NATIVE_FILE, `${JSON.stringify(native, null, 2)}\n`)
  console.log(`wrote ${native.length} datasheets to ${path.relative(process.cwd(), NATIVE_FILE)}`)
}

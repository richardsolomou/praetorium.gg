import fs from 'node:fs'
import path from 'node:path'
import type { Stratagem, StratagemLimit } from '../core/battle'
import { routeSlug } from '../core/slug'
import { criteriaKey, loadMissionCriteria, pairCriteria, type Payout } from './missionCriteria'
import {
  factionRestrictions,
  findDescription,
  findDetachmentAbilities,
  loadWahapediaDescriptions,
  WAHAPEDIA_ATTRIBUTION,
} from './wahapedia'

/**
 * Stratagems and secondary mission cards, from the Tabletop Developer Consortium's
 * dataset.
 *
 * The community catalogues carry neither, and this one is licensed CC BY 4.0 —
 * which is the whole reason it can be used at all. Attribution is a condition of
 * that licence rather than a courtesy, so `ATTRIBUTION` goes on screen wherever
 * this data does.
 */
const ATTRIBUTION = 'Stratagems and mission cards by the Tabletop Developer Consortium, CC BY 4.0'
const BATTLEMASTER_ATTRIBUTION = 'Terrain geometry provided by Battlemaster'

/** How the dataset words a usage limit, mapped onto what the battle enforces. */
const LIMITS: Record<string, StratagemLimit> = {
  'once-per-phase': 'phase',
  'once-per-turn': 'turn',
  'once-per-battle': 'battle',
  'once-per-battle-round': 'turn',
}

type RawStratagem = {
  id: string
  name: string
  category?: string
  detachment_id?: string | null
  cp_cost?: number
  timing?: string
  type?: string
  phases?: string[]
  player_turn?: string
  game_version?: { edition?: string; dataslate?: string }
}

type RawCard = {
  id: string
  name: string
  card_type?: string
  text?: string
  awards?: RawAward[]
  when_drawn?: {
    operation?: string
    battle_round?: { min?: number; max?: number }
    card_ids?: string[]
    condition?: { subject?: string; quantifier?: string; unit_filter?: { wounds_min?: number; model_count_min?: number } }
  }
}

type RawAward = {
  vp?: number
  vp_per?: number
  vp_max?: number
  per?: string
  mode?: string
  cumulative?: boolean
  exclusive_group?: string
  trigger?: RawTrigger
}

type RawTrigger = {
  timing?: string
  phase?: string
  player_turn?: string
  battle_round?: { min?: number; max?: number }
}

type RawMission = {
  id: string
  name: string
  vp_per_round_cap?: number
  vp_per_game_cap?: number
  secondary_vp_per_round_cap?: number
  secondary_vp_per_game_cap?: number
  deployment_pattern_ids?: string[]
  source?: string
}

type RawMatchup = { disposition: string; opponent_disposition: string; mission_id: string }

type RawDisposition = { id: string; name: string; text?: string }

type RawFaction = { id: string; name: string; aliases?: string[]; faction_rule_id?: string; logo_url?: string }

type RawDetachment = {
  id: string
  name: string
  enhancement_ids?: string[]
  stratagem_ids?: string[]
  detachment_points?: number
  force_dispositions?: string[]
}

type RawEnhancement = { id: string; name: string; detachment_id?: string; cost?: number; keyword_restrictions?: string[] }
const isUnitUpgrade = (name: string) => /\s*\(upgrade\)\s*$/i.test(name)

type Point = { x: number; y: number }

type RawPattern = {
  id: string
  name: string
  description?: string
  zones?: {
    player?: string
    name?: string
    color?: string
    position?: Point
    shape?: { points?: Point[]; width?: number; height?: number }
  }[]
  objectives?: Point[]
}

type RawTerrainLayout = {
  id: string
  name: string
  description?: string
  mission_matchup_id?: string
  variant?: number
  deployment_pattern_id?: string
  pieces?: {
    id: string
    name: string
    piece_type: string
    template: string
    position?: Point
    rotation_degrees?: number
    mirror?: string
    parent_area_id?: string
  }[]
}

type RawTerrainTemplate = {
  id: string
  name: string
  kind: string
  footprint: { type: string; points?: Point[]; width?: number; height?: number }
  features?: {
    id: string
    template: string
    position?: Point
    rotation_degrees?: number
    mirror?: string
  }[]
}

type RawBattlemasterLayout = {
  layout?: { id?: string; links?: { page?: string } }
  terrain?: {
    id?: string
    name: string
    footprint: { origin: Point; widthIn: number; heightIn: number; rotationDeg: number }
    outline: { points: Point[] }
    parts: {
      id?: string
      name: string
      material: string
      hasRoof: boolean
      origin: Point
      rotationDeg: number
      mirroredX: boolean
      mirroredY: boolean
      outline: { points: Point[] } | null
      walls: { id?: string; points: Point[]; thicknessIn: number }[]
    }[]
  }[]
}
type RawBattlemasterTerrain = NonNullable<RawBattlemasterLayout['terrain']>[number]

type TerrainGeometry = {
  areas: {
    id: string
    name: string
    points: Point[]
    markers: { label: string; position: Point }[]
    parts: {
      id: string
      name: string
      material: string
      roof: Point[] | null
      walls: { id: string; points: Point[]; thickness: number }[]
    }[]
  }[]
}

/** A battlefield, as polygons the interface can draw rather than words it must describe. */
type Deployment = {
  id: string
  name: string
  description: string | null
  /** Points are absolute: each zone's own offset is already applied. */
  zones: { player: string; name: string; colour: string; points: Point[] }[]
  objectives: Point[]
}

/**
 * One way a card pays out: a flat number of points, or a number per something
 * counted. Enough for the interface to offer the real figure instead of asking a
 * player to work it out and type it in.
 */
type Award = {
  vp: number
  per: string | null
  mode: string | null
  /** The most a per-something payout may pay in total, when the card caps it. */
  max: number | null
  /** Payouts sharing a group are alternatives: the card pays one of them, not both. */
  group: string | null
  cumulative: boolean
  /** What the mission pack says this payout asks for, when the two sources pair up. */
  criteria: string | null
  trigger: Trigger
}

/**
 * When a payout may be taken. Anything absent is unrestricted, so a card that says
 * nothing about timing can always be scored.
 */
type Trigger = { timing: string | null; phase: string | null; playerTurn: string | null; roundMin: number | null; roundMax: number | null }

export type Mission = {
  id: string
  name: string
  roundCap: number | null
  gameCap: number | null
  secondaryRoundCap: number | null
  secondaryGameCap: number | null
  source: string | null
  packId: string | null
  deploymentIds: string[]
}

/**
 * What the rules say about putting a card back the moment it is drawn.
 *
 * `redraw` is unconditional beyond what is stated here; `replace` depends on the
 * board, which no source can tell this app about. `rounds` and `heldCards` are the
 * parts a battle can check for itself; `condition` is the part only a player can.
 */
type WhenDrawn = {
  operation: 'redraw' | 'replace'
  roundMax: number | null
  /** Redraw is allowed while one of these cards is already in hand. */
  heldCards: string[]
  /** Stated for the player to judge, because the app cannot see the table. */
  condition: string | null
}

type MissionCard = { key: string; name: string; text: string | null; awards: Award[]; whenDrawn: WhenDrawn | null }

type DetachmentReference = {
  enhancements: number
  upgrades: number
  stratagems: number
  points: number | null
  dispositions: string[]
}

type DetachmentRulesDetail = {
  id: string
  name: string
  points: number | null
  dispositions: string[]
  rules: { name: string; description: string }[]
  enhancements: { name: string; points: number | null; description: string | null; keywordRestrictions: string[] }[]
  upgrades: { name: string; points: number | null; description: string | null }[]
  stratagems: {
    id: string
    name: string
    cp: number
    type: string | null
    phases: string[]
    turn: string | null
    description: string | null
  }[]
}

export type LoadedRules = {
  attribution: string
  abilityDescriptions: ReadonlyMap<string, string>
  /** Army-construction restrictions keyed by the player-facing faction slug. */
  factionRestrictions: ReturnType<typeof factionRestrictions>
  /** Faction slug then detachment slug, so a chosen detachment maps straight to its six. */
  byDetachment: Map<string, Map<string, Stratagem[]>>
  /** Display metadata for each detachment, from the same licensed source as its stratagems. */
  detachmentReferences: Map<string, Map<string, DetachmentReference>>
  detachmentDetails: Map<string, Map<string, DetachmentRulesDetail>>
  /** Player-facing faction names, separate from BSData's technical catalogue labels. */
  factionNames: Map<string, string>
  factionIcons: Map<string, string>
  factionRules: Map<string, { name: string; description: string }>
  /** Stratagems every army has, offered alongside whatever the detachment brings. */
  core: Stratagem[]
  secondaries: MissionCard[]
  primaries: MissionCard[]
  /** Which mission a pair of force dispositions plays, with pack-qualified keys and an unqualified legacy fallback. */
  missions: Map<string, Mission>
  /** The five dispositions a detachment can have, by slug. */
  dispositions: Map<string, string>
  dispositionDetails: { id: string; name: string; text: string | null }[]
  deployments: Deployment[]
  terrainLayouts: {
    id: string
    name: string
    description: string | null
    matchupId: string
    variant: number | null
    deploymentId: string | null
    pieces: {
      id: string
      name: string
      type: string
      templateId: string
      position: Point
      rotation: number
      mirror: string | null
      parentAreaId: string | null
    }[]
    geometry: TerrainGeometry | null
  }[]
  terrainTemplates: {
    id: string
    name: string
    kind: string
    points: Point[]
    features: {
      id: string
      templateId: string
      position: Point
      rotation: number
      mirror: string | null
    }[]
  }[]
  /**
   * The kinds of model each datasheet is built from, keyed by the slug the product
   * already routes datasheets by.
   *
   * The catalogue we price from splits a kind of model into one entry per loadout,
   * which is bookkeeping rather than what a datasheet says. This is the datasheet's
   * own answer: named kinds, how many of each, and what each carries — so a sergeant
   * standing beside his veterans is a fact read from the data instead of a shape
   * inferred from it.
   */
  compositions: ReadonlyMap<string, UnitComposition>
  /** Weapons by id, so a composition's ids can be shown as profiles. */
  weapons: ReadonlyMap<string, LoadedWeapon>
  /** Whatever the dataset says about how settled these numbers are. */
  dataslate: string | null
}

export type UnitComposition = {
  unitId: string
  models: {
    name: string
    /** The profile the kind shares with its siblings, when the data separates the two. */
    profile: string | null
    min: number
    max: number
    leader: boolean
    /**
     * The weapons it starts with. The id is kept because names repeat across
     * factions — several books have a "Power weapon", and only the id says which.
     */
    weapons: { id: string; name: string }[]
  }[]
  /** What a kind of model may carry instead of what it starts with. */
  options: {
    /** The upstream id, so a player's pick can point at one swap and stay pointed. */
    id: string
    /** The kind this applies to, as the composition names it. */
    model: string | null
    gives: { id: string; name: string }[]
    /** Each entry is one alternative; an alternative may be several weapons at once. */
    takes: { id: string; name: string }[][]
    /** Whether the swap costs points, which decides whether it can be offered at all. */
    free: boolean
  }[]
}

/** A weapon as the rules source describes it, ready to be shown as a profile. */
export type LoadedWeapon = {
  name: string
  melee: boolean
  profiles: { name: string; melee: boolean; range: string; stats: { name: string; value: string }[]; keywords: string[] }[]
}

type RawWargearOption = {
  id?: string
  unit_id?: string
  is_free?: boolean
  replaces?: string[]
  replacement?: string[]
  replacement_choice?: string[][]
  model_constraint?: { model_name?: string }
}

type RawComposition = {
  unit_id?: string
  models?: {
    name?: string
    profile_name?: string
    min?: number
    max?: number
    is_leader_model?: boolean
    default_weapon_ids?: string[]
  }[]
}

type RawWeapon = {
  id?: string
  name?: string
  type?: string
  profiles?: {
    name?: string
    range?: number | string
    stats?: Record<string, number | string | null>
    keywords?: { keyword_id?: string; parameters?: Record<string, number | string> }[]
  }[]
}

/** The order a datasheet prints weapon characteristics in. */
const RANGED_STATS = ['A', 'BS', 'S', 'AP', 'D']
const MELEE_STATS = ['A', 'WS', 'S', 'AP', 'D']

/** "anti" with a target and a threshold reads as "Anti-Infantry 4+" on the card. */
function keywordLabel(keyword: { keyword_id?: string; parameters?: Record<string, number | string> }) {
  const name = titleCase((keyword.keyword_id ?? '').replaceAll('-', ' '))
  const target = keyword.parameters?.target_keyword
  const threshold = keyword.parameters?.threshold
  if (target && threshold) return `${name}-${target} ${threshold}+`
  const value = keyword.parameters ? Object.values(keyword.parameters)[0] : undefined
  return value === undefined ? name : `${name} ${value}`
}

/**
 * Upstream ids transliterate accents that our route slugs drop, so "Khârn" is
 * `kharn` there and `kh-rn` here. Folding the accent back rather than changing
 * `routeSlug`, which is what existing links are already built from.
 */
const joinKey = (nameOrSlug: string) =>
  nameOrSlug
    .normalize('NFD')
    .replaceAll(/\p{M}+/gu, '')
    .toLocaleLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '')

/** Sits inside the catalogue directory, so one sync brings every source. */
function rulesDirectory(dataDirectory = process.env.DATA_DIR ?? '/data') {
  return process.env.RULES_DIR ?? path.join(path.resolve(dataDirectory), 'catalogue', 'rules')
}

export function loadRules(
  directory = rulesDirectory(),
  wahapediaDirectory = path.join(path.dirname(directory), 'wahapedia'),
  battlemasterDirectory = path.join(path.dirname(directory), 'battlemaster'),
  iconDirectory = path.join(path.dirname(directory), 'faction-icons'),
  datacardsDirectory = path.join(path.dirname(directory), 'datacards', '11th', 'gdc'),
): LoadedRules | null {
  const core = path.join(directory, 'data', 'core')
  if (!fs.existsSync(core)) return null
  const wahapedia = loadWahapediaDescriptions(wahapediaDirectory)

  const byDetachment = new Map<string, Map<string, Stratagem[]>>()
  const detachmentReferences = new Map<string, Map<string, DetachmentReference>>()
  const detachmentDetails = new Map<string, Map<string, DetachmentRulesDetail>>()
  const factionNames = new Map<string, string>()
  const factionIcons = new Map<string, string>()
  const factionRules = new Map<string, { name: string; description: string }>()
  const compositions = new Map<string, UnitComposition>()
  const weaponNames = new Map<string, string>()
  const weapons = new Map<string, LoadedWeapon>()
  let dataslate: string | null = null

  // Weapons first: a composition holds ids, and only this says what they are and do.
  for (const faction of fs.readdirSync(core, { withFileTypes: true })) {
    if (!faction.isDirectory() || faction.name.startsWith('_')) continue
    for (const weapon of readOptionalList<RawWeapon>(path.join(core, faction.name, 'weapons.json'))) {
      if (!weapon.id || !weapon.name) continue
      weaponNames.set(weapon.id, weapon.name)
      const melee = (weapon.type ?? '').toLocaleLowerCase() === 'melee'
      weapons.set(weapon.id, {
        name: weapon.name,
        melee,
        profiles: (weapon.profiles ?? []).map((profile) => {
          // Whether a row is melee belongs to the profile rather than the weapon: a
          // staff of light is typed as something that shoots and strikes in melee
          // too, and only the profile says which of the two this row is. Read the
          // wrong way it prints a fighting weapon with a ballistic skill and a range
          // of `Melee"`.
          const fights = melee || String(profile.range ?? '').toLocaleLowerCase() === 'melee' || profile.stats?.WS !== undefined
          return {
            name: profile.name ?? weapon.name!,
            melee: fights,
            range: fights ? 'Melee' : profile.range === undefined ? '-' : `${profile.range}"`,
            stats: (fights ? MELEE_STATS : RANGED_STATS).map((stat) => {
              const value = profile.stats?.[stat]
              // A torrent weapon needs no roll to hit, and the data says so by leaving
              // the characteristic out. A datasheet prints the rest as "3+".
              if (value === undefined || value === null) return { name: stat, value: '-' }
              const skill = stat === 'WS' || stat === 'BS'
              return { name: stat, value: `${value}${skill ? '+' : ''}` }
            }),
            keywords: (profile.keywords ?? []).map(keywordLabel),
          }
        }),
      })
    }
  }

  // Not everything a model carries is a weapon: a shield has a name and a rule but
  // no profile, and a swap that grants one still has to be able to name it.
  for (const faction of fs.readdirSync(core, { withFileTypes: true })) {
    if (!faction.isDirectory() || faction.name.startsWith('_')) continue
    for (const item of readOptionalList<RawWeapon>(path.join(core, faction.name, 'wargear.json'))) {
      if (item.id && item.name && !weaponNames.has(item.id)) weaponNames.set(item.id, item.name)
    }
  }

  for (const faction of fs.readdirSync(core, { withFileTypes: true })) {
    if (!faction.isDirectory() || faction.name.startsWith('_')) continue
    for (const raw of readOptionalList<RawComposition>(path.join(core, faction.name, 'unit-compositions.json'))) {
      if (!raw.unit_id || !raw.models?.length) continue
      const models = raw.models.flatMap((model) =>
        model.name
          ? [
              {
                name: model.name,
                profile: model.profile_name ?? null,
                min: model.min ?? 0,
                max: model.max ?? model.min ?? 0,
                leader: Boolean(model.is_leader_model),
                // A weapon the id table does not know is left out rather than named
                // after its id, which would put a slug in front of a player.
                weapons: (model.default_weapon_ids ?? []).flatMap((id) => {
                  const name = weaponNames.get(id)
                  return name ? [{ id, name }] : []
                }),
              },
            ]
          : [],
      )
      if (models.length) compositions.set(joinKey(raw.unit_id), { unitId: raw.unit_id, models, options: [] })
    }
  }

  for (const faction of fs.readdirSync(core, { withFileTypes: true })) {
    if (!faction.isDirectory() || faction.name.startsWith('_')) continue
    for (const raw of readOptionalList<RawWargearOption>(path.join(core, faction.name, 'wargear-options.json'))) {
      const composition = raw.unit_id ? compositions.get(joinKey(raw.unit_id)) : undefined
      if (!composition) continue
      const named = (ids: string[]) => ids.flatMap((id) => (weaponNames.get(id) ? [{ id, name: weaponNames.get(id)! }] : []))
      const takes = [...(raw.replacement ? [raw.replacement] : []), ...(raw.replacement_choice ?? [])]
        .map(named)
        .filter((one) => one.length)
      if (!takes.length) continue
      if (!raw.id) continue
      composition.options.push({
        id: raw.id,
        model: raw.model_constraint?.model_name ?? null,
        gives: named(raw.replaces ?? []),
        takes,
        free: raw.is_free !== false,
      })
    }
  }

  for (const faction of fs.readdirSync(core, { withFileTypes: true })) {
    if (!faction.isDirectory() || faction.name.startsWith('_')) continue
    const file = path.join(core, faction.name, 'stratagems.json')
    const factionFile = path.join(core, faction.name, 'factions.json')
    if (fs.existsSync(factionFile)) {
      for (const found of readJson<RawFaction[]>(factionFile)) {
        factionNames.set(found.id, found.name)
        const icon = path.join(iconDirectory, `${found.id}.svg`)
        if (found.logo_url) {
          const source = fs.existsSync(icon) ? `data:image/svg+xml;base64,${fs.readFileSync(icon).toString('base64')}` : found.logo_url
          factionIcons.set(found.id, source)
          for (const alias of found.aliases ?? []) factionIcons.set(routeSlug(alias), source)
        }
        const description = found.faction_rule_id ? wahapedia?.abilities.get(found.faction_rule_id) : null
        if (found.faction_rule_id && description) {
          const name = titleCase(found.faction_rule_id.replaceAll('-', ' ')).replace(/\s(Of|The|And|For|From|In|To)\b/g, (word) =>
            word.toLowerCase(),
          )
          const rule = { name, description }
          factionRules.set(found.id, rule)
          for (const alias of found.aliases ?? []) factionRules.set(routeSlug(alias), rule)
        }
      }
    }
    const referenceFile = path.join(core, faction.name, 'detachments.json')
    const enhancementFile = path.join(core, faction.name, 'enhancements.json')
    if (fs.existsSync(referenceFile)) {
      const rawDetachments = readJson<RawDetachment[]>(referenceFile)
      const enhancements = fs.existsSync(enhancementFile) ? readJson<RawEnhancement[]>(enhancementFile) : []
      const rawStratagems = fs.existsSync(file) ? readJson<RawStratagem[]>(file) : []
      detachmentReferences.set(
        faction.name,
        new Map(
          rawDetachments.map((detachment) => [
            detachment.id,
            {
              enhancements: enhancements.filter(
                (enhancement) => enhancement.detachment_id === detachment.id && !isUnitUpgrade(enhancement.name),
              ).length,
              upgrades: enhancements.filter((enhancement) => enhancement.detachment_id === detachment.id && isUnitUpgrade(enhancement.name))
                .length,
              stratagems: detachment.stratagem_ids?.length ?? 0,
              points: detachment.detachment_points ?? null,
              dispositions: detachment.force_dispositions ?? [],
            },
          ]),
        ),
      )
      detachmentDetails.set(
        faction.name,
        new Map(
          rawDetachments.map((detachment) => [
            detachment.id,
            {
              id: detachment.id,
              name: detachment.name,
              points: detachment.detachment_points ?? null,
              dispositions: detachment.force_dispositions ?? [],
              rules: wahapedia ? [...findDetachmentAbilities(wahapedia.detachmentAbilities, detachment.name)] : [],
              enhancements: enhancements
                .filter((enhancement) => enhancement.detachment_id === detachment.id && !isUnitUpgrade(enhancement.name))
                .map((enhancement) => ({
                  name: enhancement.name,
                  points: enhancement.cost ?? null,
                  description: wahapedia ? findDescription(wahapedia.enhancements, detachment.name, enhancement.name) : null,
                  keywordRestrictions: enhancement.keyword_restrictions ?? [],
                })),
              upgrades: enhancements
                .filter((enhancement) => enhancement.detachment_id === detachment.id && isUnitUpgrade(enhancement.name))
                .map((enhancement) => ({
                  name: enhancement.name.replace(/\s*\(upgrade\)\s*$/i, ''),
                  points: enhancement.cost ?? null,
                  description: wahapedia ? findDescription(wahapedia.enhancements, detachment.name, enhancement.name) : null,
                })),
              stratagems: rawStratagems
                .filter((stratagem) => stratagem.detachment_id === detachment.id)
                .map((stratagem) => ({
                  id: stratagem.id,
                  name: titleCase(stratagem.name),
                  cp: stratagem.cp_cost ?? 0,
                  type: stratagem.type ? titleCase(stratagem.type.replaceAll('-', ' ')) : null,
                  phases: stratagem.phases ?? [],
                  turn: stratagem.player_turn ?? null,
                  description: wahapedia ? findDescription(wahapedia.stratagems, detachment.name, stratagem.name) : null,
                }))
                .toSorted(byName),
            },
          ]),
        ),
      )
    }
    if (!fs.existsSync(file)) continue

    const detachments = new Map<string, Stratagem[]>()
    for (const raw of readOptionalList<RawStratagem>(file)) {
      dataslate ??= raw.game_version?.dataslate ?? null
      if (!raw.detachment_id) continue
      const existing = detachments.get(raw.detachment_id) ?? []
      existing.push(toStratagem(raw))
      detachments.set(raw.detachment_id, existing)
    }
    if (detachments.size) byDetachment.set(faction.name, detachments)
  }

  const coreStratagems = readOptionalList<RawStratagem>(path.join(core, 'stratagems.json')).map(toStratagem)
  const cards = readOptionalList<RawCard>(path.join(core, 'secondary-cards.json'))
  // What a payout asks for is the mission pack's to say; when it is due is this file's.
  const criteria = loadMissionCriteria(datacardsDirectory)
  const card = (raw: RawCard) => toCard(raw, criteria.get(criteriaKey(raw.name)) ?? [])
  const secondaries = cards
    .filter((entry) => entry.card_type !== 'primary')
    .map(card)
    .toSorted(byName)
  const primaries = cards
    .filter((entry) => entry.card_type === 'primary')
    .map(card)
    .toSorted(byName)

  const missions = new Map<string, Mission>()
  const byId = new Map(readOptionalList<RawMission>(path.join(core, 'missions.json')).map((mission) => [mission.id, mission]))
  for (const matchup of readOptionalList<RawMatchup>(path.join(core, 'mission-matchups.json'))) {
    const mission = byId.get(matchup.mission_id)
    if (!mission) continue
    const resolved = {
      id: mission.id,
      name: mission.name,
      roundCap: mission.vp_per_round_cap ?? null,
      gameCap: mission.vp_per_game_cap ?? null,
      secondaryRoundCap: mission.secondary_vp_per_round_cap ?? null,
      secondaryGameCap: mission.secondary_vp_per_game_cap ?? null,
      source: mission.source ?? null,
      packId: mission.source ? routeSlug(mission.source) : null,
      deploymentIds: mission.deployment_pattern_ids ?? [],
    }
    const pair = `${matchup.disposition}|${matchup.opponent_disposition}`
    if (!missions.has(pair)) missions.set(pair, resolved)
    if (resolved.packId) missions.set(`${resolved.packId}|${pair}`, resolved)
  }

  const dispositionDetails = readOptionalList<RawDisposition>(path.join(core, 'force-dispositions.json')).map((entry) => ({
    id: entry.id,
    name: entry.name,
    text: entry.text ?? null,
  }))
  const dispositions = new Map(dispositionDetails.map((entry) => [entry.id, entry.name]))
  const deployments = readOptionalList<RawPattern>(path.join(core, 'deployment-patterns.json'))
    .map((pattern) => ({
      id: pattern.id,
      name: pattern.name,
      description: pattern.description ?? null,
      zones: (pattern.zones ?? [])
        .filter((zone) => pointsOf(zone.shape).length > 2)
        .map((zone) => ({
          player: zone.player ?? 'either',
          name: zone.name ?? 'Deployment',
          colour: zone.color ?? '#8c9199',
          // A zone's points are relative to its own position, so the offset is
          // applied here: without it every zone piles up in one corner.
          points: pointsOf(zone.shape).map((point) => ({
            x: point.x + (zone.position?.x ?? 0),
            y: point.y + (zone.position?.y ?? 0),
          })),
        })),
      objectives: pattern.objectives ?? [],
    }))
    .filter((pattern) => pattern.zones.length)
    .toSorted((left, right) => left.name.localeCompare(right.name))
  const terrainLayouts = readOptionalList<RawTerrainLayout>(path.join(core, 'terrain-layouts.json'))
    .filter((layout) => layout.mission_matchup_id)
    .map((layout) => ({
      id: layout.id,
      name: layout.name,
      description: layout.description ?? null,
      matchupId: layout.mission_matchup_id!,
      variant: layout.variant ?? null,
      deploymentId: layout.deployment_pattern_id ?? null,
      geometry: battlemasterGeometry(battlemasterDirectory, layout.description),
      pieces: (layout.pieces ?? [])
        .filter((piece) => piece.position)
        .map((piece) => ({
          id: piece.id,
          name: piece.name,
          type: piece.piece_type,
          templateId: piece.template,
          position: piece.position!,
          rotation: piece.rotation_degrees ?? 0,
          mirror: piece.mirror ?? null,
          parentAreaId: piece.parent_area_id ?? null,
        })),
    }))
  const terrainTemplates = readOptionalList<RawTerrainTemplate>(path.join(core, 'terrain-templates.json')).map((template) => ({
    id: template.id,
    name: template.name,
    kind: template.kind,
    points: footprintPoints(template.footprint),
    features: (template.features ?? []).map((feature) => ({
      id: feature.id,
      templateId: feature.template,
      position: feature.position ?? { x: 0, y: 0 },
      rotation: feature.rotation_degrees ?? 0,
      mirror: feature.mirror ?? null,
    })),
  }))

  if (!byDetachment.size && !secondaries.length) return null
  const hasBattlemaster = terrainLayouts.some((layout) => layout.geometry)
  return {
    attribution: [ATTRIBUTION, wahapedia ? WAHAPEDIA_ATTRIBUTION : null, hasBattlemaster ? BATTLEMASTER_ATTRIBUTION : null]
      .filter(Boolean)
      .join('. '),
    abilityDescriptions: wahapedia?.abilities ?? new Map(),
    factionRestrictions: factionRestrictions(wahapedia?.abilities ?? new Map()),
    byDetachment,
    detachmentReferences,
    detachmentDetails,
    factionNames,
    factionIcons,
    factionRules,
    core: coreStratagems,
    secondaries,
    primaries,
    missions,
    dispositions,
    dispositionDetails,
    deployments,
    terrainLayouts,
    terrainTemplates,
    compositions,
    weapons,
    dataslate,
  }
}

/**
 * The kinds of model a datasheet is built from, or nothing when the data is silent.
 *
 * Takes the datasheet's name or its slug: either folds to the same key, which is what
 * lets an accented name find a source that spells it without one.
 */
export function compositionOf(rules: LoadedRules | null, nameOrSlug: string): UnitComposition | null {
  return rules?.compositions?.get(joinKey(nameOrSlug)) ?? null
}

/** The primary an army plays, derived from its disposition and the one opposing it. */
export function missionFor(
  rules: LoadedRules,
  one: string | null,
  two: string | null,
  missionPackId: string | null = null,
): Mission | null {
  if (!one || !two) return null
  if (missionPackId) {
    const selected = rules.missions.get(`${missionPackId}|${one}|${two}`)
    if (selected) return selected
    if ([...rules.missions.keys()].some((key) => key.split('|').length === 3)) return null
  }
  return rules.missions.get(`${one}|${two}`) ?? null
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function readOptionalList<T>(file: string): T[] {
  return fs.existsSync(file) ? readJson<T[]>(file) : []
}

function battlemasterGeometry(directory: string, description: string | undefined): TerrainGeometry | null {
  const id = description?.match(/Battlemaster layout (terrain-[0-9a-f-]+)/)?.[1]
  if (!id) return null
  const file = path.join(directory, 'layouts', `${id}.json`)
  if (!fs.existsSync(file)) return null
  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as RawBattlemasterLayout
  if (!battlemasterLayoutMatches(raw.layout, id) || !raw.terrain?.length) return null

  return {
    areas: raw.terrain.map((area, areaIndex) => ({
      id: area.id ?? `area-${areaIndex + 1}`,
      name: area.name,
      points: area.outline.points.map((point) => battlemasterBoardPoint(point, area.footprint)),
      markers: terrainReferenceMarkers(area),
      parts: area.parts.map((part, partIndex) => ({
        id: part.id ?? `area-${areaIndex + 1}-part-${partIndex + 1}`,
        name: part.name,
        material: part.material,
        roof: part.outline?.points.map((point) => battlemasterBoardPoint(point, area.footprint, part)) ?? null,
        walls: part.walls.map((wall, wallIndex) => ({
          id: wall.id ?? `area-${areaIndex + 1}-part-${partIndex + 1}-wall-${wallIndex + 1}`,
          points: wall.points.map((point) => battlemasterBoardPoint(point, area.footprint, part)),
          thickness: wall.thicknessIn,
        })),
      })),
    })),
  }
}

function battlemasterLayoutMatches(layout: RawBattlemasterLayout['layout'], id: string) {
  if (layout?.id === id) return true
  if (!layout?.links?.page) return false
  try {
    return new URL(layout.links.page).pathname.endsWith(`/${id}`)
  } catch {
    return false
  }
}

function terrainReferenceMarkers(area: RawBattlemasterTerrain) {
  const labels = area.name.match(/\b(?:AB|CD|EF|GH)\b/g) ?? []
  const areaPoints = area.outline.points.map((point) => battlemasterBoardPoint(point, area.footprint))
  const areaCentre = averagePoint(areaPoints)
  return labels.map((label, index) => {
    const part = area.parts.find((candidate) => candidate.name === label)
    const partPoints = part
      ? [...(part.outline?.points ?? []), ...part.walls.flatMap((wall) => wall.points)].map((point) =>
          battlemasterBoardPoint(point, area.footprint, part),
        )
      : []
    const fraction = labels.length === 1 ? 0.5 : (index + 1) / (labels.length + 1)
    const partCentre = partPoints.length ? averagePoint(partPoints) : null
    const towardCentre = partCentre ? { x: areaCentre.x - partCentre.x, y: areaCentre.y - partCentre.y } : null
    const towardCentreLength = towardCentre ? Math.hypot(towardCentre.x, towardCentre.y) : 0
    return {
      label,
      position:
        partCentre && towardCentre && towardCentreLength
          ? {
              x: partCentre.x + (towardCentre.x / towardCentreLength) * 2,
              y: partCentre.y + (towardCentre.y / towardCentreLength) * 2,
            }
          : battlemasterBoardPoint({ x: area.footprint.widthIn * fraction, y: area.footprint.heightIn / 2 }, area.footprint),
    }
  })
}

function averagePoint(points: Point[]) {
  return {
    x: points.reduce((total, point) => total + point.x, 0) / points.length,
    y: points.reduce((total, point) => total + point.y, 0) / points.length,
  }
}

function battlemasterBoardPoint(
  point: Point,
  area: RawBattlemasterTerrain['footprint'],
  part?: RawBattlemasterTerrain['parts'][number],
): Point {
  let placed = point
  if (part) {
    placed = {
      x: part.mirroredX ? -placed.x : placed.x,
      y: part.mirroredY ? -placed.y : placed.y,
    }
    placed = rotatePoint(placed, part.rotationDeg)
    placed = { x: placed.x + part.origin.x, y: placed.y + part.origin.y }
  }
  placed = rotatePoint(placed, area.rotationDeg)
  placed = { x: placed.x + area.origin.x, y: placed.y + area.origin.y }
  return { x: placed.x + 30, y: 22 - placed.y }
}

function rotatePoint(point: Point, degrees: number): Point {
  const radians = (degrees * Math.PI) / 180
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)
  return { x: point.x * cosine - point.y * sine, y: point.x * sine + point.y * cosine }
}

function footprintPoints(footprint: RawTerrainTemplate['footprint']): Point[] {
  if (footprint.points?.length) return footprint.points
  if (footprint.width && footprint.height) {
    return [
      { x: 0, y: 0 },
      { x: footprint.width, y: 0 },
      { x: footprint.width, y: footprint.height },
      { x: 0, y: footprint.height },
    ]
  }
  return []
}

function pointsOf(shape: { points?: Point[]; width?: number; height?: number } | undefined): Point[] {
  if (shape?.points?.length) return shape.points
  if (shape?.width && shape.height) {
    return [
      { x: 0, y: 0 },
      { x: shape.width, y: 0 },
      { x: shape.width, y: shape.height },
      { x: 0, y: shape.height },
    ]
  }
  return []
}

const byName = (left: { name: string }, right: { name: string }) => left.name.localeCompare(right.name)

/**
 * A card with its payouts flattened.
 *
 * An award that pays per something keeps `per` so the interface can say what it is
 * counting; one that pays a flat amount does not. Anything with no number at all is
 * dropped: a button that scores nothing is worse than no button.
 */
function toCard(raw: RawCard, payouts: Payout[]): MissionCard {
  const awards = (raw.awards ?? [])
    .map((award) => ({
      vp: award.vp ?? award.vp_per ?? 0,
      per: award.vp_per ? (award.per ?? 'each') : null,
      max: award.vp_max ?? null,
      mode: award.mode ?? null,
      group: award.exclusive_group ?? null,
      cumulative: award.cumulative ?? false,
      criteria: null as string | null,
      trigger: {
        timing: award.trigger?.timing ?? null,
        phase: award.trigger?.phase ?? null,
        playerTurn: award.trigger?.player_turn ?? null,
        roundMin: award.trigger?.battle_round?.min ?? null,
        roundMax: award.trigger?.battle_round?.max ?? null,
      },
    }))
    .filter((award) => award.vp > 0)
  // Paired before anything is folded together, because the pack lists a card's payouts
  // as printed and a fold would leave the two sides counting different things.
  const criteria = pairCriteria(awards, payouts)
  const described = awards.map((award, at) => ({ ...award, criteria: criteria[at] ?? null }))
  return { key: raw.id, name: raw.name, text: raw.text ?? null, awards: dedupe(described), whenDrawn: toWhenDrawn(raw.when_drawn) }
}

function toWhenDrawn(raw: RawCard['when_drawn']): WhenDrawn | null {
  if (raw?.operation !== 'redraw' && raw?.operation !== 'replace') return null
  return {
    operation: raw.operation,
    roundMax: raw.battle_round?.max ?? null,
    heldCards: raw.card_ids ?? [],
    condition: raw.condition ? describeCondition(raw.condition) : null,
  }
}

/** The board state a redraw depends on, in the words a player would check it in. */
function describeCondition(condition: NonNullable<NonNullable<RawCard['when_drawn']>['condition']>): string {
  const filter = condition.unit_filter ?? {}
  const what = filter.wounds_min
    ? `models with a Wounds characteristic of ${filter.wounds_min} or more`
    : filter.model_count_min
      ? `units with a Starting Strength of ${filter.model_count_min} or more`
      : 'units'
  const whose = condition.subject === 'opponent' ? 'enemy' : 'friendly'
  return condition.quantifier === 'none'
    ? `there are no ${whose} ${what} on the battlefield`
    : `there are ${whose} ${what} on the battlefield`
}

/** The same payout written twice is one button, not two. */
function dedupe(awards: Award[]): Award[] {
  const seen = new Map<string, Award>()
  for (const award of awards) {
    const trigger = award.trigger
    seen.set(
      `${award.vp}/${award.per}/${award.max}/${award.mode}/${award.criteria}/${award.group}/${award.cumulative}/${trigger.timing}/${trigger.phase}/${trigger.playerTurn}/${trigger.roundMin}/${trigger.roundMax}`,
      award,
    )
  }
  return [...seen.values()]
}

/** Titled rather than shouted: the dataset stores names in capitals. */
function toStratagem(raw: RawStratagem): Stratagem {
  const phases = (raw.phases ?? []).filter((phase): phase is NonNullable<Stratagem['phases']>[number] =>
    ['command', 'movement', 'shooting', 'charge', 'fight', 'end'].includes(phase),
  )
  const turn = ['your-turn', 'opponent-turn', 'either'].includes(raw.player_turn ?? '')
    ? (raw.player_turn as NonNullable<Stratagem['turn']>)
    : undefined
  return {
    key: raw.id,
    name: titleCase(raw.name),
    cp: raw.cp_cost ?? 0,
    // An unrecognised timing becomes `unlimited` rather than a guess that would
    // wrongly stop a player using something.
    limit: LIMITS[raw.timing ?? ''] ?? 'unlimited',
    ...(phases.length ? { phases } : {}),
    ...(turn ? { turn } : {}),
  }
}

// An apostrophe is not a word boundary: "Mortarion's Teachings", never "Mortarion'S".
const titleCase = (name: string) =>
  name
    .toLocaleLowerCase()
    .replaceAll(/(^|[\s(\-–—])([a-z])/g, (_, before: string, letter: string) => `${before}${letter.toLocaleUpperCase()}`)

/** "Chaos - Death Guard" and "Death Lord's Chosen" both reduce to what the dataset keys on. */
export const slug = (name: string) =>
  name
    .split(' - ')
    .at(-1)!
    .toLocaleLowerCase()
    .replaceAll(/['’]/g, '')
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

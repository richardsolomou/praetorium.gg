import fs from 'node:fs'
import path from 'node:path'
import type { Stratagem, StratagemLimit } from '../core/battle'

/**
 * Stratagems and secondary mission cards, from the Tabletop Developer Consortium's
 * dataset.
 *
 * The community catalogues carry neither, and this one is licensed CC BY 4.0 —
 * which is the whole reason it can be used at all. Attribution is a condition of
 * that licence rather than a courtesy, so `ATTRIBUTION` goes on screen wherever
 * this data does.
 */
export const ATTRIBUTION = 'Stratagems and mission cards by the Tabletop Developer Consortium, CC BY 4.0'

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
  game_version?: { edition?: string; dataslate?: string }
}

type RawCard = {
  id: string
  name: string
  card_type?: string
  text?: string
  awards?: RawAward[]
}

type RawAward = {
  vp?: number
  vp_per?: number
  per?: string
  mode?: string
  cumulative?: boolean
  when?: { type?: string }
  trigger?: RawTrigger
}

type RawTrigger = {
  timing?: string
  phase?: string
  player_turn?: string
  battle_round?: { min?: number; max?: number }
}

type RawMission = { id: string; name: string; vp_per_round_cap?: number; vp_per_game_cap?: number }

type RawMatchup = { disposition: string; opponent_disposition: string; mission_id: string }

type RawDisposition = { id: string; name: string }

type Point = { x: number; y: number }

type RawPattern = {
  id: string
  name: string
  description?: string
  zones?: { player?: string; name?: string; color?: string; position?: Point; shape?: { points?: Point[] } }[]
  objectives?: Point[]
}

/** A battlefield, as polygons the interface can draw rather than words it must describe. */
export type Deployment = {
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
export type Award = { vp: number; per: string | null; mode: string | null; when: string | null; trigger: Trigger }

/**
 * When a payout may be taken. Anything absent is unrestricted, so a card that says
 * nothing about timing can always be scored.
 */
export type Trigger = { phase: string | null; playerTurn: string | null; roundMin: number | null; roundMax: number | null }

export type Mission = { id: string; name: string; roundCap: number | null; gameCap: number | null }

export type MissionCard = { key: string; name: string; text: string | null; awards: Award[] }

export type LoadedRules = {
  /** Faction slug then detachment slug, so a chosen detachment maps straight to its six. */
  byDetachment: Map<string, Map<string, Stratagem[]>>
  /** Stratagems every army has, offered alongside whatever the detachment brings. */
  core: Stratagem[]
  secondaries: MissionCard[]
  primaries: MissionCard[]
  /** Which mission a pair of force dispositions plays, keyed `a|b`. */
  missions: Map<string, Mission>
  /** The five dispositions a detachment can have, by slug. */
  dispositions: Map<string, string>
  deployments: Deployment[]
  /** Whatever the dataset says about how settled these numbers are. */
  dataslate: string | null
}

export function rulesDirectory(dataDirectory = process.env.DATA_DIR ?? '/data') {
  return process.env.RULES_DIR ?? path.join(path.resolve(dataDirectory), 'rules')
}

export function loadRules(directory = rulesDirectory()): LoadedRules | null {
  const core = path.join(directory, 'data', 'core')
  if (!fs.existsSync(core)) return null

  const byDetachment = new Map<string, Map<string, Stratagem[]>>()
  let dataslate: string | null = null

  for (const faction of fs.readdirSync(core, { withFileTypes: true })) {
    if (!faction.isDirectory() || faction.name.startsWith('_')) continue
    const file = path.join(core, faction.name, 'stratagems.json')
    if (!fs.existsSync(file)) continue

    const detachments = new Map<string, Stratagem[]>()
    for (const raw of readStratagems(file)) {
      dataslate ??= raw.game_version?.dataslate ?? null
      if (!raw.detachment_id) continue
      const existing = detachments.get(raw.detachment_id) ?? []
      existing.push(toStratagem(raw))
      detachments.set(raw.detachment_id, existing)
    }
    if (detachments.size) byDetachment.set(faction.name, detachments)
  }

  const coreStratagems = readStratagems(path.join(core, 'stratagems.json')).map(toStratagem)
  const cards = readCards(path.join(core, 'secondary-cards.json'))
  const secondaries = cards
    .filter((card) => card.card_type !== 'primary')
    .map(toCard)
    .toSorted(byName)
  const primaries = cards
    .filter((card) => card.card_type === 'primary')
    .map(toCard)
    .toSorted(byName)

  const missions = new Map<string, Mission>()
  const byId = new Map(readMissions(path.join(core, 'missions.json')).map((mission) => [mission.id, mission]))
  for (const matchup of readMatchups(path.join(core, 'mission-matchups.json'))) {
    const mission = byId.get(matchup.mission_id)
    if (!mission) continue
    missions.set(`${matchup.disposition}|${matchup.opponent_disposition}`, {
      id: mission.id,
      name: mission.name,
      roundCap: mission.vp_per_round_cap ?? null,
      gameCap: mission.vp_per_game_cap ?? null,
    })
  }

  const dispositions = new Map(readDispositions(path.join(core, 'force-dispositions.json')).map((entry) => [entry.id, entry.name]))
  const deployments = readPatterns(path.join(core, 'deployment-patterns.json'))
    .map((pattern) => ({
      id: pattern.id,
      name: pattern.name,
      description: pattern.description ?? null,
      zones: (pattern.zones ?? [])
        .filter((zone) => (zone.shape?.points ?? []).length > 2)
        .map((zone) => ({
          player: zone.player ?? 'either',
          name: zone.name ?? 'Deployment',
          colour: zone.color ?? '#8c9199',
          // A zone's points are relative to its own position, so the offset is
          // applied here: without it every zone piles up in one corner.
          points: (zone.shape?.points ?? []).map((point) => ({
            x: point.x + (zone.position?.x ?? 0),
            y: point.y + (zone.position?.y ?? 0),
          })),
        })),
      objectives: pattern.objectives ?? [],
    }))
    .filter((pattern) => pattern.zones.length)
    .toSorted((left, right) => left.name.localeCompare(right.name))

  if (!byDetachment.size && !secondaries.length) return null
  return { byDetachment, core: coreStratagems, secondaries, primaries, missions, dispositions, deployments, dataslate }
}

/**
 * The mission two armies play, which 11th edition takes from their force
 * dispositions rather than from either player's choice. Order is not significant.
 */
export function missionFor(rules: LoadedRules, one: string | null, two: string | null): Mission | null {
  if (!one || !two) return null
  return rules.missions.get(`${one}|${two}`) ?? rules.missions.get(`${two}|${one}`) ?? null
}

function readStratagems(file: string): RawStratagem[] {
  if (!fs.existsSync(file)) return []
  const parsed: RawStratagem[] = JSON.parse(fs.readFileSync(file, 'utf8'))
  return parsed
}

function readMissions(file: string): RawMission[] {
  if (!fs.existsSync(file)) return []
  const parsed: RawMission[] = JSON.parse(fs.readFileSync(file, 'utf8'))
  return parsed
}

function readMatchups(file: string): RawMatchup[] {
  if (!fs.existsSync(file)) return []
  const parsed: RawMatchup[] = JSON.parse(fs.readFileSync(file, 'utf8'))
  return parsed
}

function readPatterns(file: string): RawPattern[] {
  if (!fs.existsSync(file)) return []
  const parsed: RawPattern[] = JSON.parse(fs.readFileSync(file, 'utf8'))
  return parsed
}

function readDispositions(file: string): RawDisposition[] {
  if (!fs.existsSync(file)) return []
  const parsed: RawDisposition[] = JSON.parse(fs.readFileSync(file, 'utf8'))
  return parsed
}

function readCards(file: string): RawCard[] {
  if (!fs.existsSync(file)) return []
  const parsed: RawCard[] = JSON.parse(fs.readFileSync(file, 'utf8'))
  return parsed
}

const byName = (left: MissionCard, right: MissionCard) => left.name.localeCompare(right.name)

/**
 * A card with its payouts flattened.
 *
 * An award that pays per something keeps `per` so the interface can say what it is
 * counting; one that pays a flat amount does not. Anything with no number at all is
 * dropped: a button that scores nothing is worse than no button.
 */
function toCard(raw: RawCard): MissionCard {
  const awards = (raw.awards ?? [])
    .map((award) => ({
      vp: award.vp ?? award.vp_per ?? 0,
      per: award.vp_per ? (award.per ?? 'each') : null,
      mode: award.mode ?? null,
      when: award.when?.type ?? null,
      trigger: {
        phase: award.trigger?.phase ?? null,
        playerTurn: award.trigger?.player_turn ?? null,
        roundMin: award.trigger?.battle_round?.min ?? null,
        roundMax: award.trigger?.battle_round?.max ?? null,
      },
    }))
    .filter((award) => award.vp > 0)
  return { key: raw.id, name: raw.name, text: raw.text ?? null, awards: dedupe(awards) }
}

/** The same payout written twice is one button, not two. */
function dedupe(awards: Award[]): Award[] {
  const seen = new Map<string, Award>()
  for (const award of awards) {
    const trigger = award.trigger
    seen.set(`${award.vp}/${award.per}/${award.mode}/${trigger.phase}/${trigger.playerTurn}/${trigger.roundMin}/${trigger.roundMax}`, award)
  }
  return [...seen.values()]
}

/** Titled rather than shouted: the dataset stores names in capitals. */
function toStratagem(raw: RawStratagem): Stratagem {
  return {
    key: raw.id,
    name: titleCase(raw.name),
    cp: raw.cp_cost ?? 0,
    // An unrecognised timing becomes `unlimited` rather than a guess that would
    // wrongly stop a player using something.
    limit: LIMITS[raw.timing ?? ''] ?? 'unlimited',
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

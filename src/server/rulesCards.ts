import fs from 'node:fs'
import path from 'node:path'
import { compile } from 'html-to-text'
import type { Stratagem, StratagemLimit } from '../core/battle'
import { routeSlug } from '../core/slug'
import { criteriaIn, criteriaKey, pairCriteria, type Payout } from './missionCriteria'
import { type MissionPack, readMissionPacks } from './missionPacks'
import { byName, readOptionalList, titleCase } from './rulesSource'

/**
 * Stratagems, secondary cards and the primary a matchup plays.
 *
 * Every number a player might otherwise be asked to work out and type comes from
 * here. Where the dataset is silent the answer is "unrestricted" rather than a guess:
 * an unrecognised timing becomes `unlimited`, and a payout with no stated trigger is
 * never put on a schedule.
 */

/** How the dataset words a usage limit, mapped onto what the battle enforces. */
const LIMITS: Record<string, StratagemLimit> = {
  'once-per-phase': 'phase',
  'once-per-turn': 'turn',
  'once-per-battle': 'battle',
  'once-per-battle-round': 'turn',
}

export type RawStratagem = {
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

type Localized = { en?: string }

type RawCoreStratagem = {
  name?: Localized
  type?: string
  fluff?: Localized
  when?: Localized
  target?: Localized
  effect?: Localized
  restrictions?: Localized
}

type RawCoreCards = { stratagems?: RawCoreStratagem[] }

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

export type RawDisposition = { id: string; name: string; text?: string }

/**
 * One way a card pays out: a flat number of points, or a number per something
 * counted. Enough for the interface to offer the real figure instead of asking a
 * player to work it out and type it in.
 */
export type Award = {
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
export type Trigger = {
  timing: string | null
  phase: string | null
  playerTurn: string | null
  roundMin: number | null
  roundMax: number | null
}

export type Mission = {
  id: string
  name: string
  roundCap: number | null
  gameCap: number | null
  secondaryRoundCap: number | null
  secondaryGameCap: number | null
  /** What one Fixed Secondary Mission card may bank all battle, where the pack states it. */
  fixedSecondaryCap?: number | null
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
export type WhenDrawn = {
  operation: 'redraw' | 'replace'
  roundMax: number | null
  /** Redraw is allowed while one of these cards is already in hand. */
  heldCards: string[]
  /** Stated for the player to judge, because the app cannot see the table. */
  condition: string | null
}

export type MissionCard = { key: string; name: string; text: string | null; awards: Award[]; whenDrawn: WhenDrawn | null }

export type LoadedCards = {
  core: Stratagem[]
  coreDetails: { id: string; type: string | null; description: string }[]
  secondaries: MissionCard[]
  primaries: MissionCard[]
}

/**
 * The core stratagems every army has, and the card decks, with each payout paired to
 * what the mission pack says it asks for.
 */
export function loadCards(
  core: string,
  datacardsDirectory: string,
  packs: readonly MissionPack[] = readMissionPacks(datacardsDirectory),
): LoadedCards {
  const cards = readOptionalList<RawCard>(path.join(core, 'secondary-cards.json'))
  const coreStratagems = readOptionalList<RawStratagem>(path.join(core, 'stratagems.json'))
  // What a payout asks for is the mission pack's to say; when it is due is this file's.
  const criteria = criteriaIn(packs)
  const card = (raw: RawCard) => toCard(raw, criteria.get(criteriaKey(raw.name)) ?? [])
  return {
    core: coreStratagems.map(toStratagem),
    coreDetails: coreDescriptions(datacardsDirectory, coreStratagems),
    secondaries: cards
      .filter((entry) => entry.card_type !== 'primary')
      .map(card)
      .toSorted(byName),
    primaries: cards
      .filter((entry) => entry.card_type === 'primary')
      .map(card)
      .toSorted(byName),
  }
}

const coreText = compile({ wordwrap: false })

/** Core stratagem prose lives in Game Datacards' `11th/gdc/core.json`, keyed to the rules source by name. */
function coreDescriptions(datacardsDirectory: string, rules: readonly RawStratagem[]): LoadedCards['coreDetails'] {
  const file = path.join(datacardsDirectory, 'core.json')
  if (!fs.existsSync(file)) return []
  const cards = JSON.parse(fs.readFileSync(file, 'utf8')) as RawCoreCards
  const descriptionsByName = new Map((cards.stratagems ?? []).map((card) => [criteriaKey(card.name?.en ?? ''), card]))
  return rules.flatMap((rule) => {
    const card = descriptionsByName.get(criteriaKey(rule.name))
    if (!card) return []
    const sections = [
      card.fluff?.en ? coreText(card.fluff.en).trim() : null,
      describedSection('When', card.when?.en),
      describedSection('Target', card.target?.en),
      describedSection('Effect', card.effect?.en),
      describedSection('Restrictions', card.restrictions?.en),
    ].filter((section): section is string => Boolean(section))
    return sections.length ? [{ id: rule.id, type: card.type ?? null, description: sections.join('\n\n') }] : []
  })
}

const describedSection = (label: string, value: string | undefined) => {
  const text = value ? coreText(value).trim() : ''
  return text ? `**${label}:** ${text}` : null
}

/**
 * Which mission a pair of dispositions plays, keyed both by pack and without one.
 *
 * The unqualified key is the fallback for settings that name no pack. A selected pack
 * must never fall through to another, which is what `missionFor` then enforces.
 */
export function loadMissions(core: string): Map<string, Mission> {
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
  return missions
}

export function loadDispositions(core: string): { id: string; name: string; text: string | null }[] {
  return readOptionalList<RawDisposition>(path.join(core, 'force-dispositions.json')).map((entry) => ({
    id: entry.id,
    name: entry.name,
    text: entry.text ?? null,
  }))
}

/** The primary an army plays, derived from its disposition and the one opposing it. */
export function missionForIn(
  missions: ReadonlyMap<string, Mission>,
  one: string | null,
  two: string | null,
  missionPackId: string | null = null,
): Mission | null {
  if (!one || !two) return null
  if (missionPackId) {
    const selected = missions.get(`${missionPackId}|${one}|${two}`)
    if (selected) return selected
    if ([...missions.keys()].some((key) => key.split('|').length === 3)) return null
  }
  return missions.get(`${one}|${two}`) ?? null
}

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
export function toStratagem(raw: RawStratagem): Stratagem {
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

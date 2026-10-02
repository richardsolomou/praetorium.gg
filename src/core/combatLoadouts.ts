import type { Datasheet } from '../contracts/catalogue'
import { calculateCombat, type CombatInput, type CombatOptions, type CombatResult } from './combat'
import type { WeaponAdjustment } from './combatAdjustments'
import { combatEquipmentMatches, type CombatCarrier } from './combatLoadout'
import { combatAttackInput, combatAttacks, combatWeaponInputs, type CombatAttacker, type CombatOpponent } from './combatScenario'
import { datasheetProfileKind } from './datasheetStructure'
import { wargearKey } from './wargear'

type Phase = 'ranged' | 'melee'
const PHASES = ['ranged', 'melee'] as const

/**
 * One option of a weapon choice, built the way the roster would build it from the current loadout:
 * taken outright (0), or given to one more (1) or one fewer (−1) model.
 */
export type LoadoutOption = { group: string; entry: string; step: -1 | 0 | 1; carriers: CombatCarrier[] }
/** A unit's current carriers, every weapon profile it could carry, and the legal options of each weapon choice. */
export type LoadoutSpace = { carriers: CombatCarrier[]; weapons: Datasheet['profiles']; choices: LoadoutOption[][] }
export type LoadoutScore = Record<Phase, CombatResult | null>

export const isWeaponProfile = (profile: Datasheet['profiles'][number]) =>
  ['ranged-weapon', 'melee-weapon'].includes(datasheetProfileKind(profile.type))

/** The datasheet with each weapon profile it could carry counted from the carriers that hold it. */
export function loadoutSheet(sheet: Datasheet, weapons: Datasheet['profiles'], carriers: readonly CombatCarrier[]): Datasheet {
  const held = (profile: Datasheet['profiles'][number]) =>
    carriers.reduce(
      (total, carrier) =>
        total + carrier.weapons.reduce((sum, piece) => sum + (combatEquipmentMatches(piece, profile) ? piece.count : 0), 0),
      0,
    )
  // The matchup's own profiles keep variants the every-weapon view can merge, and the order that picks each
  // default mode; the view adds what the unit does not carry, in catalogue order between them.
  const own = sheet.profiles.filter(isWeaponProfile)
  const profiles: Datasheet['profiles'] = []
  let next = 0
  for (const profile of weapons) {
    const at = own.findIndex((entry) => entry.id === profile.id)
    if (at < 0) profiles.push(profile)
    else if (at >= next) {
      profiles.push(...own.slice(next, at + 1))
      next = at + 1
    }
  }
  profiles.push(...own.slice(next))
  return {
    ...sheet,
    profiles: [
      ...sheet.profiles.filter((profile) => !isWeaponProfile(profile)),
      ...profiles.flatMap((profile) => {
        const count = held(profile)
        return count ? [{ ...profile, count }] : []
      }),
    ],
  }
}

const SAME = 1e-9
/** Positive when `left` is the better attack: likelier to destroy the unit, then more models, then more wounds. */
export function compareOutcomes(left: CombatResult, right: CombatResult) {
  for (const field of ['wipe', 'meanKills', 'meanDamage'] as const) {
    const difference = left[field] - right[field]
    if (Math.abs(difference) > SAME) return difference
  }
  return 0
}

/**
 * A weapon profile alone, at the `count` the unit carries or one when it carries none. `best` marks the
 * strongest of one weapon's profiles, so a player knows which mode to use.
 */
export type ProfileOdds = { phase: Phase; result: CombatResult; count: number; best: boolean }

/** Every weapon profile the unit could carry, resolved alone against the target. */
export function loadoutProfileOdds(space: LoadoutSpace, scoring: LoadoutScoring) {
  const held = new Map(scoring.sheet.profiles.filter(isWeaponProfile).map((profile) => [profile.id, profile.count ?? 0]))
  const weapons = [
    ...new Map([...scoring.sheet.profiles.filter(isWeaponProfile), ...space.weapons].map((profile) => [profile.id, profile])).values(),
  ]
  const sheet = {
    ...scoring.sheet,
    profiles: [
      ...scoring.sheet.profiles.filter((profile) => !isWeaponProfile(profile)),
      ...weapons.map((profile) => ({ ...profile, count: held.get(profile.id) || 1 })),
    ],
  }
  const odds = new Map<string, ProfileOdds>()
  for (const phase of PHASES) {
    const setup = scoring.phases[phase]
    if (!setup) continue
    const inputs = combatWeaponInputs(
      { sheet, carriers: space.carriers, models: scoring.models, rules: scoring.rules },
      scoring.opponent,
      phase,
      setup.target,
      setup.options,
      setup.adjustment,
    )
    for (const { profile, input } of inputs) {
      try {
        odds.set(profile.id, { phase, result: calculateCombat(input), count: held.get(profile.id) || 1, best: false })
      } catch {
        // A profile the calculation refuses has no odds to show.
      }
    }
    const modes = new Map<string, string[]>()
    for (const { profile } of inputs) modes.set(wargearKey(profile.name), [...(modes.get(wargearKey(profile.name)) ?? []), profile.id])
    for (const ids of modes.values()) {
      const scored = ids.flatMap((id) => (odds.get(id) ? [odds.get(id)!] : []))
      const top = scored.toSorted((left, right) => compareOutcomes(right.result, left.result))
      if (top.length > 1 && compareOutcomes(top[0]!.result, top[1]!.result) > 0) top[0]!.best = true
    }
  }
  return odds
}

export type LoadoutScoring = {
  sheet: Datasheet
  models: number
  rules: CombatAttacker['rules']
  opponent: CombatOpponent
  preferences: Readonly<Record<string, string>>
  excluded: Readonly<Record<Phase, readonly string[]>>
  phases: Record<Phase, { target: CombatInput['target']; options: CombatOptions; adjustment: WeaponAdjustment } | null>
}

/** Scores carriers through the same attack plan and calculation as the matchup itself. */
function loadoutScorer(space: LoadoutSpace, scoring: LoadoutScoring) {
  const results = new Map<string, CombatResult | null>()
  const calculate = (input: CombatInput | null) => {
    if (!input) return null
    const key = JSON.stringify(input)
    if (!results.has(key)) {
      try {
        results.set(key, calculateCombat(input))
      } catch {
        results.set(key, null)
      }
    }
    return results.get(key) ?? null
  }
  const inputs = (carriers: readonly CombatCarrier[]) => {
    const attacks = combatAttacks(
      { sheet: loadoutSheet(scoring.sheet, space.weapons, carriers), carriers, models: scoring.models, rules: scoring.rules },
      scoring.opponent,
      scoring.preferences,
      scoring.excluded,
    )
    const input = (phase: Phase) => {
      const setup = scoring.phases[phase]
      return setup ? combatAttackInput(attacks[phase], setup.target, setup.options, setup.adjustment) : null
    }
    return { ranged: input('ranged'), melee: input('melee') }
  }
  return {
    inputs,
    score: (carriers: readonly CombatCarrier[]): LoadoutScore => {
      const { ranged, melee } = inputs(carriers)
      return { ranged: calculate(ranged), melee: calculate(melee) }
    },
  }
}

/** What one option does to the attack, for the phases its choice affects. */
export type OptionEstimate = { step: LoadoutOption['step']; phases: Partial<Record<Phase, { result: CombatResult; best: boolean }>> }

/** The editor names an option by its group and catalogue entry. */
export const estimateKey = (group: string, entry: string) => `${group}|${entry}`

/**
 * Each option's result for the phases its choice affects. A choice whose options all resolve alike
 * in a phase, such as a melee weapon when shooting, says nothing about that phase.
 */
export function optionEstimates(
  choices: readonly (readonly (Omit<LoadoutOption, 'carriers'> & { score: LoadoutScore })[])[],
  now: LoadoutScore,
) {
  const found = new Map<string, OptionEstimate>()
  for (const options of choices)
    for (const { group, entry, step, score } of options) {
      const phases: OptionEstimate['phases'] = {}
      for (const phase of PHASES) {
        const result = score[phase]
        const before = now[phase]
        const results = options.flatMap((other) => (other.score[phase] ? [other.score[phase]] : []))
        if (!result || !before || !results.some((other) => compareOutcomes(other, before) !== 0)) continue
        const top = results.reduce((best, candidate) => (compareOutcomes(candidate, best) > 0 ? candidate : best))
        phases[phase] = { result, best: compareOutcomes(result, top) === 0 }
      }
      if (Object.keys(phases).length) found.set(estimateKey(group, entry), { step, phases })
    }
  return found
}

/**
 * Every option of every weapon choice, and every weapon profile alone, against the target. A phase whose
 * current carriers do not reproduce the matchup's own attack, `expected`, would compare a different unit,
 * so its options get no estimate.
 */
export function loadoutOdds(space: LoadoutSpace, scoring: LoadoutScoring, expected: Record<Phase, CombatInput | null>) {
  const scorer = loadoutScorer(space, scoring)
  const inputs = scorer.inputs(space.carriers)
  const score = scorer.score(space.carriers)
  const now = Object.fromEntries(
    PHASES.map((phase) => [phase, JSON.stringify(inputs[phase]) === JSON.stringify(expected[phase]) ? score[phase] : null]),
  ) as LoadoutScore
  const choices = space.choices.map((options) => options.map(({ carriers, ...option }) => ({ ...option, score: scorer.score(carriers) })))
  return { estimates: optionEstimates(choices, now), profiles: loadoutProfileOdds(space, scoring) }
}

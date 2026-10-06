import type { Datasheet } from './datasheet'
import { calculateCombat, calculateCombatSequence, type CombatInput, type CombatOptions, type CombatResult } from './combat'
import type { RosterPick } from './roster'
import type { WeaponAdjustment } from './combatAdjustments'
import { combatEquipmentMatches, type CombatCarrier } from './combatLoadout'
import { combatAttackInput, combatAttacks, combatWeaponInputs, type CombatAttacker, type CombatOpponent } from './combatScenario'
import { datasheetProfileKind } from './datasheetStructure'
import { wargearKey } from './wargear'
import { activeCombatRules, combatRuleDefences, combatRuleOptions, type CombatRule } from './combatRules'

type Phase = 'ranged' | 'melee'
const PHASES = ['ranged', 'melee'] as const

/**
 * One option of a weapon choice, built the way the roster would build it from the current loadout:
 * taken outright (0), or given to one more (1) or one fewer (−1) model.
 */
export type LoadoutOption = { group: string; entry: string; step: -1 | 0 | 1; carriers: CombatCarrier[] }
/** A unit's current carriers, every weapon profile it could carry, and the legal options of each weapon choice. */
export type LoadoutSpace = { carriers: CombatCarrier[]; weapons: Datasheet['profiles']; choices: LoadoutOption[][] }
export function namespaceLoadoutSpace(space: LoadoutSpace, prefix: string): LoadoutSpace {
  const carriers = (entries: CombatCarrier[]) =>
    entries.map((carrier) => ({
      ...carrier,
      weapons: carrier.weapons.map((weapon) => ({
        ...weapon,
        ...(weapon.profileIds ? { profileIds: weapon.profileIds.map((id) => `${prefix}${id}`) } : {}),
      })),
    }))
  return {
    carriers: carriers(space.carriers),
    weapons: space.weapons.map((profile) => ({ ...profile, id: `${prefix}${profile.id}` })),
    choices: space.choices.map((choices) => choices.map((choice) => ({ ...choice, carriers: carriers(choice.carriers) }))),
  }
}
export type LoadoutCandidate = {
  members: { pickIndex: number; pick: RosterPick; sheet: Datasheet; models: number; carriers: CombatCarrier[]; rules: CombatRule[] }[]
}
export type LoadoutCandidates = { candidates: LoadoutCandidate[] }
export type LoadoutBatch = LoadoutCandidates & { built: number; scheduled: number; done: boolean }
export type OptimizedLoadout = {
  picks: { pickIndex: number; pick: RosterPick }[]
  preferences: Record<string, string>
  result: CombatResult
}

export function applyOptimizedLoadout<T extends RosterPick>(picks: readonly T[], optimized: OptimizedLoadout['picks']): T[] {
  const updates = new Map(optimized.map((member) => [member.pickIndex, member.pick]))
  return picks.map((pick, index) => {
    const update = updates.get(index)
    return update ? { ...pick, choices: update.choices, spreads: update.spreads } : pick
  })
}
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
const OUTCOME_PRIORITIES = ['wipe', 'meanKills', 'meanDamage'] as const
export type OutcomePriority = (typeof OUTCOME_PRIORITIES)[number]

export function outcomePriority(left: CombatResult, right: CombatResult): OutcomePriority | undefined {
  for (const field of OUTCOME_PRIORITIES) {
    if (Math.abs(left[field] - right[field]) > SAME) return field
  }
  return undefined
}

/** Positive when `left` is the better attack: likelier to destroy the unit, then more models, then more wounds. */
export function compareOutcomes(left: CombatResult, right: CombatResult) {
  const field = outcomePriority(left, right)
  return field ? left[field] - right[field] : 0
}

/**
 * A weapon profile alone, on the `models` that carry it or on one model when none does. `best` marks the
 * strongest of one weapon's profiles, so a player knows which mode to use.
 */
export type ProfileOdds = { phase: Phase; result: CombatResult; models: number; best: boolean; bestBy?: OutcomePriority }

/** Every weapon profile the unit could carry, resolved alone against the target. */
export function loadoutProfileOdds(space: LoadoutSpace, scoring: LoadoutScoring) {
  const member = loadoutMember(scoring)
  const held = new Map(member.sheet.profiles.filter(isWeaponProfile).map((profile) => [profile.id, profile.count ?? 0]))
  const weapons = [
    ...new Map([...member.sheet.profiles.filter(isWeaponProfile), ...space.weapons].map((profile) => [profile.id, profile])).values(),
  ]
  const sheet = {
    ...member.sheet,
    profiles: [
      ...member.sheet.profiles.filter((profile) => !isWeaponProfile(profile)),
      ...weapons.map((profile) => ({ ...profile, count: held.get(profile.id) || 1 })),
    ],
  }
  // A model can carry two of one weapon, so its bearers are counted rather than the weapons.
  const bearers = (profile: Datasheet['profiles'][number]) =>
    space.carriers.reduce(
      (total, carrier) =>
        total +
        Math.min(
          carrier.models,
          carrier.weapons.reduce((sum, piece) => sum + (combatEquipmentMatches(piece, profile) ? piece.count : 0), 0),
        ),
      0,
    ) || 1
  const odds = new Map<string, ProfileOdds>()
  for (const phase of PHASES) {
    const setup = scoring.phases[phase]
    if (!setup) continue
    const inputs = combatWeaponInputs(
      { ...member, sheet, carriers: space.carriers, companions: scoring.companions },
      scoring.opponent,
      phase,
      setup.target,
      setup.options,
      setup.adjustment,
    )
    for (const { profile, input } of inputs) {
      try {
        odds.set(profile.id, { phase, result: calculateCombat(input), models: bearers(profile), best: false })
      } catch {
        // A profile the calculation refuses has no odds to show.
      }
    }
    const modes = new Map<string, string[]>()
    for (const { profile } of inputs) modes.set(wargearKey(profile.name), [...(modes.get(wargearKey(profile.name)) ?? []), profile.id])
    for (const ids of modes.values()) {
      const scored = ids.flatMap((id) => (odds.get(id) ? [odds.get(id)!] : []))
      const top = scored.toSorted((left, right) => compareOutcomes(right.result, left.result))
      if (top.length > 1 && compareOutcomes(top[0]!.result, top[1]!.result) > 0) {
        top[0]!.best = true
        top[0]!.bestBy = outcomePriority(top[0]!.result, top[1]!.result)
      }
    }
  }
  return odds
}

export type LoadoutScoring = {
  memberIndex?: number
  carriers?: CombatAttacker['carriers']
  sequenceError?: string
  ruleChoices?: Readonly<Record<string, number>>
  sheet: Datasheet
  models: number
  companions?: CombatAttacker['companions']
  rules: CombatAttacker['rules']
  opponent: CombatOpponent
  preferences: Readonly<Record<string, string>>
  excluded: Readonly<Record<Phase, readonly string[]>>
  phases: Record<Phase, { target: CombatInput['target']; options: CombatOptions; adjustment: WeaponAdjustment } | null>
}

function loadoutMember(scoring: LoadoutScoring): CombatAttacker {
  const member = scoring.memberIndex
    ? scoring.companions?.[scoring.memberIndex - 1]
    : {
        sheet: scoring.sheet,
        models: scoring.models,
        rules: scoring.rules,
        carriers: scoring.carriers ?? [],
      }
  if (!member) throw new Error('The unit member could not be loaded.')
  return member
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
    const member = loadoutMember(scoring)
    const changed = { ...member, sheet: loadoutSheet(member.sheet, space.weapons, carriers), carriers }
    const attacks = combatAttacks(
      scoring.memberIndex
        ? {
            ...loadoutMember({ ...scoring, memberIndex: 0 }),
            companions: scoring.companions?.map((entry, index) => (index === scoring.memberIndex! - 1 ? changed : entry)),
          }
        : { ...changed, companions: scoring.companions },
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
export type OptionEstimate = {
  step: LoadoutOption['step']
  phases: Partial<Record<Phase, { result: CombatResult; best: boolean; bestBy?: OutcomePriority }>>
}

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
        const runnerUp = results
          .filter((candidate) => compareOutcomes(top, candidate) > 0)
          .reduce<CombatResult | undefined>(
            (best, candidate) => (!best || compareOutcomes(candidate, best) > 0 ? candidate : best),
            undefined,
          )
        const best = compareOutcomes(result, top) === 0
        phases[phase] = { result, best, bestBy: best && runnerUp ? outcomePriority(top, runnerUp) : undefined }
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

export function optimizeLoadout(space: LoadoutCandidates, scoring: LoadoutScoring): OptimizedLoadout {
  if (scoring.sequenceError) throw new Error(scoring.sequenceError)
  let best: OptimizedLoadout | undefined
  const results = new Map<string, CombatResult>()
  let work = 0
  let retainedBytes = 0
  for (const candidate of space.candidates) {
    const members = candidate.members.map((member) => ({
      sheet: member.sheet,
      carriers: member.carriers,
      models: member.models,
      rules: activeCombatRules(member.rules, scoring.ruleChoices ?? {}),
    }))
    const attacker = { ...members[0]!, companions: members.slice(1) }
    if (!members.length) throw new Error('The attached unit could not be loaded.')
    for (const phase of PHASES) {
      const setup = scoring.phases[phase]
      if (!setup) continue
      const sameDefences =
        JSON.stringify(combatRuleDefences(setup.target, [], phase, scoring.rules)) ===
        JSON.stringify(combatRuleDefences(setup.target, [], phase, attacker.rules))
      const sameOptions =
        members.length > 1 ||
        JSON.stringify(combatRuleOptions(scoring.rules ?? [], 'attacker', phase)) ===
          JSON.stringify(combatRuleOptions(attacker.rules, 'attacker', phase))
      if (!sameDefences || !sameOptions) throw new Error('Some loadouts change unit-wide rules. Optimization could not finish.')
    }
    const search = (preferences: Record<string, string>, chosen: ReadonlySet<string>) => {
      if (++work > 100_000) throw new Error('The full search could not finish. The best loadout found so far has been kept.')
      const attacks = combatAttacks(attacker, scoring.opponent, preferences, { ranged: [], melee: [] })
      const choice = PHASES.flatMap((phase) => attacks[phase].plan.choices).find(
        (entry) => !chosen.has(entry.key) && !entry.key.endsWith(':one-shot'),
      )
      if (choice) {
        for (const option of choice.options) search({ ...preferences, [choice.key]: option.value }, new Set([...chosen, choice.key]))
        return
      }
      const inputs = PHASES.map((phase) => {
        const setup = scoring.phases[phase]
        const attack = attacks[phase]
        if (!setup || !attack.base) throw new Error('Some loadouts contain unsupported rules. Optimization could not finish.')
        return (
          combatAttackInput(attack, setup.target, setup.options, setup.adjustment) ?? {
            target: setup.target,
            weapons: [],
            options: setup.options,
          }
        )
      })
      const key = JSON.stringify(inputs)
      let result = results.get(key)
      if (!result) {
        retainedBytes += key.length * 2
        if (results.size >= 20_000 || retainedBytes > 32 * 1024 * 1024)
          throw new Error('The full search could not finish. The best loadout found so far has been kept.')
        result = calculateCombatSequence(inputs)
        results.set(key, result)
      }
      if (!best || compareOutcomes(result, best.result) > 0)
        best = { picks: candidate.members.map(({ pickIndex, pick }) => ({ pickIndex, pick })), preferences, result }
    }
    search({ ...scoring.preferences }, new Set())
  }
  if (!best) throw new Error('No supported legal loadout is available.')
  return best
}

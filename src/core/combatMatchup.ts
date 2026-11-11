import {
  COMBAT_PHASES,
  DEFAULT_COMBAT_OPTIONS,
  calculateCombat,
  calculateCombatSequence,
  bestReroll,
  hitRollNeeded,
  type CombatAfterLosses,
  type CombatInput,
  type CombatOptions,
  type CombatResult,
  type CombatPhase,
  type CombatTargetGroup,
} from './combat'
import { uniqueBy } from './collections'
import { adjustCombatTarget, combineAttackAdjustments, combineWeaponAdjustments, type CombatAdjustments } from './combatAdjustments'
import { compareOutcomes } from './combatLoadouts'
import { SHOOTING_TYPE_KEY } from './combatProfiles'
import { combatRuleDefences, combatRuleOptions } from './combatRules'
import { combatAttackInput, combatAttacks } from './combatScenario'
import { combatUnitKeywords, combatUnitSequenceError, combatUnitTarget, type CombatMember } from './combatUnit'

export type CombatantSnapshot = CombatMember & { ruleChoices?: Readonly<Record<string, number>> }
type CombatMatchupChoices = {
  preferences: Readonly<Record<string, string>>
  excluded: Readonly<Record<CombatPhase, readonly string[]>>
  /** Defence-group labels the player moved earlier in the allocation order. */
  allocation: readonly string[]
}
/** A matchup that leaves every weapon in. */
export const noExclusions = (): Record<CombatPhase, string[]> => ({ ranged: [], melee: [] })
export type CombatRequest = Record<CombatPhase, CombatInput | null> & {
  sequenceError?: string
  /** The melee attacks once shooting destroys members whose defences the rest of the unit shared. */
  meleeAfterLosses?: CombatAfterLosses[]
}
type CombatPhaseAnswer = { result?: CombatResult; error?: string } | null
export type CombatAnswer = Record<CombatPhase, CombatPhaseAnswer> & { combined?: CombatPhaseAnswer }

/**
 * How one unit's attacks meet another: the defender's allocation order, both units' rule options, and the
 * calculation each phase makes once a set of situational adjustments is layered over them.
 */
export function combatMatchup(attacker: CombatantSnapshot | null, defender: CombatantSnapshot | null, choices: CombatMatchupChoices) {
  const matchup = phaseMatchup(attacker, defender, choices)
  const afterLosses = defender
    ? sharedDefenceLosses(defender, matchup.target?.target?.groups).map(({ units, remaining }) => ({
        units,
        matchup: phaseMatchup(attacker, remaining, choices),
      }))
    : []
  return {
    ...matchup,
    afterLosses,
    /** Both phases, with the melee attacks for each set of members shooting can destroy first. */
    request: (adjustments: CombatAdjustments): CombatRequest => {
      const meleeAfterLosses = afterLosses.flatMap(({ units, matchup: after }) => {
        const input = after.scenario('melee', adjustments)
        return input ? [{ units, input }] : []
      })
      return {
        ranged: matchup.scenario('ranged', adjustments),
        melee: matchup.scenario('melee', adjustments),
        sequenceError: matchup.sequenceError,
        ...(meleeAfterLosses.length ? { meleeAfterLosses } : {}),
      }
    },
  }
}

/** Whether a choice picks which weapon or weapon profile attacks, rather than how the unit shoots or what it has already spent. */
const weaponChoice = (key: string) => key !== SHOOTING_TYPE_KEY && !/:(?:group|one-shot)$/.test(key)

/**
 * The given weapon choices, with each one left open set to the option that does most against the defender. Open
 * choices are settled one at a time with the rest at their defaults, so a unit whose choices interact may not get its
 * best combination.
 */
export async function strongestWeaponPreferences(
  attacker: CombatantSnapshot | null,
  defender: CombatantSnapshot | null,
  choices: CombatMatchupChoices,
  adjustments: CombatAdjustments,
  calculate: (requests: CombatRequest[]) => Promise<CombatAnswer[]>,
): Promise<Record<string, string>> {
  const preferences = { ...choices.preferences }
  const settled = new Set(Object.keys(preferences))
  for (const phase of COMBAT_PHASES) {
    for (;;) {
      const plan = phaseMatchup(attacker, defender, { ...choices, preferences }).plans[phase]
      const open = plan?.choices.find((choice) => !settled.has(choice.key) && choice.options.length > 1 && weaponChoice(choice.key))
      if (!open) break
      settled.add(open.key)
      const options = open.options.flatMap((option) => {
        const input = phaseMatchup(attacker, defender, { ...choices, preferences: { ...preferences, [open.key]: option.value } }).scenario(
          phase,
          adjustments,
        )
        return input ? [{ value: option.value, request: { ranged: null, melee: null, [phase]: input } }] : []
      })
      const answers = await calculate(options.map((option) => option.request))
      let best: { value: string; result: CombatResult } | undefined
      options.forEach((option, at) => {
        const result = answers[at]?.[phase]?.result
        if (result && (!best || compareOutcomes(result, best.result) > 0)) best = { value: option.value, result }
      })
      if (best) preferences[open.key] = best.value
    }
  }
  return preferences
}

/**
 * The defender without the rules each set of its members shared, for every set an earlier phase can destroy while
 * another member survives. Members that share a name stay out: `combatUnitSequenceError` refuses their shared defences.
 */
function sharedDefenceLosses(defender: CombatantSnapshot, groups: readonly CombatTargetGroup[] | undefined) {
  if (!defender.companions?.length || !groups) return []
  const members = [defender, ...defender.companions]
  const sources = new Set(
    members.flatMap((member) =>
      (member.rules ?? []).flatMap((rule) =>
        rule.source &&
        members.filter((other) => other.sheet.name === rule.source).length === 1 &&
        rule.effects.some((effect) => effect.role === 'defender')
          ? [rule.source]
          : [],
      ),
    ),
  )
  const losses = new Map<string, string[]>()
  for (let at = 1; at < groups.length; at++) {
    const units = [...sources].filter((unit) => !groups.slice(at).some((group) => group.unit === unit))
    if (units.length) losses.set(JSON.stringify(units), units)
  }
  return [...losses.values()].map((units) => {
    const without = <Member extends CombatMember>(member: Member): Member => ({
      ...member,
      rules: member.rules?.filter((rule) => !rule.source || !units.includes(rule.source)),
    })
    return { units, remaining: { ...without(defender), companions: defender.companions!.map(without) } }
  })
}

function phaseMatchup(
  attacker: CombatantSnapshot | null,
  defender: CombatantSnapshot | null,
  { preferences, excluded, allocation }: CombatMatchupChoices,
) {
  const built = defender ? combatUnitTarget(defender) : null
  const position = (label: string) => (allocation.includes(label) ? allocation.indexOf(label) : allocation.length)
  const priority = (index: number) => {
    const group = built?.target?.groups[index]
    return (group?.character ? 2 : 0) + ((group?.damage ?? 0) > 0 ? 0 : 1)
  }
  const order = (built?.labels ?? [])
    .map((_, index) => index)
    .toSorted((a, b) => priority(a) - priority(b) || position(built!.labels[a]!) - position(built!.labels[b]!))
  const labels = order.map((index) => built!.labels[index]!)
  const target =
    built?.target && defender
      ? {
          ...built,
          labels,
          target: {
            ...built.target,
            groups: order.map((index) => built.target!.groups[index]!),
            damage: defender.companions?.length ? 0 : (defender.damage ?? 0),
          },
        }
      : built
  const attackRules = attacker?.rules ?? []
  const defenceRules = defender?.rules ?? []
  const unitDefences = (phase: CombatPhase) => {
    if (!target?.target || !defender) return null
    if (!defender.companions?.length) return combatRuleDefences(target.target, defenceRules, phase, attackRules)
    const calculated = combatUnitTarget(defender, phase, attackRules)
    return calculated.target ? { ...calculated.target, groups: order.map((index) => calculated.target!.groups[index]!) } : null
  }
  const ruleDefences = { ranged: unitDefences('ranged'), melee: unitDefences('melee') }
  const defencesIn = (phase: CombatPhase, adjustments: CombatAdjustments) =>
    ruleDefences[phase] ? adjustCombatTarget(ruleDefences[phase], adjustments.target ?? {}) : null
  const withExtraFeelNoPain = (defences: CombatInput['target'], adjustments: CombatAdjustments) => {
    const extra = adjustments.feelNoPain ?? null
    return {
      ...defences,
      feelNoPain: extra && (!defences.feelNoPain || extra < defences.feelNoPain) ? extra : defences.feelNoPain,
      groups: defences.groups.map((group) => ({
        ...group,
        ...(extra && group.feelNoPain !== undefined ? { feelNoPain: Math.min(group.feelNoPain ?? 7, extra) } : {}),
      })),
    }
  }
  // Attached members scope their options to their own weapons, except single-die re-rolls, which the whole unit shares.
  const unitAttackOptions = (phase: CombatPhase): Partial<CombatOptions> => {
    if (!attacker?.companions?.length) return combatRuleOptions(attackRules, 'attacker', phase)
    const memberRules = uniqueBy(
      [attacker, ...attacker.companions].flatMap((member) => member.rules ?? []),
      (rule) => rule.name,
    )
    const { singleRerolls } = combatRuleOptions(memberRules, 'attacker', phase)
    return singleRerolls ? { singleRerolls } : {}
  }
  const attackOptions = { ranged: unitAttackOptions('ranged'), melee: unitAttackOptions('melee') }
  const defenceOptions = {
    ranged: combatRuleOptions(defenceRules, 'defender', 'ranged'),
    melee: combatRuleOptions(defenceRules, 'defender', 'melee'),
  }
  const inherited = {
    ranged: { ...DEFAULT_COMBAT_OPTIONS, ...attackOptions.ranged, ...defenceOptions.ranged },
    melee: { ...DEFAULT_COMBAT_OPTIONS, ...attackOptions.melee, ...defenceOptions.melee },
  }
  const inheritedOptions = (phase: CombatPhase) => inherited[phase]
  const options = (phase: CombatPhase, adjustments: CombatAdjustments): CombatOptions => {
    const attack = attackOptions[phase]
    const defence = defenceOptions[phase]
    const base = inheritedOptions(phase)
    const shared = adjustments.all ?? {}
    const specific = adjustments[phase] ?? {}
    const extra = combineAttackAdjustments(shared, specific)
    const better = (field: 'hitReroll' | 'woundReroll') => bestReroll(base[field], extra[field])
    return {
      ...base,
      cover: base.cover || Boolean(extra.cover),
      halfRange: base.halfRange || Boolean(extra.halfRange),
      heavy: base.heavy || Boolean(extra.heavy),
      charged: base.charged || Boolean(extra.charged),
      lethal: extra.lethal ?? base.lethal,
      indirectFire: extra.indirectFire ?? base.indirectFire,
      ...(extra.commandReroll ? { commandReroll: extra.commandReroll } : {}),
      hitModifier: (attack.hitModifier ?? 0) + (defence.hitModifier ?? 0) + (extra.hitModifier ?? 0),
      woundModifier: (attack.woundModifier ?? 0) + (defence.woundModifier ?? 0) + (extra.woundModifier ?? 0),
      hitReroll: better('hitReroll'),
      woundReroll: better('woundReroll'),
      positiveWoundModifier:
        (attack.positiveWoundModifier ?? 0) +
        (defence.positiveWoundModifier ?? 0) +
        Math.max(0, shared.woundModifier ?? 0) +
        Math.max(0, specific.woundModifier ?? 0),
      psychicHitModifier:
        (attack.psychicHitModifier ?? 0) +
        (defence.psychicHitModifier ?? 0) +
        Math.max(0, shared.hitModifier ?? 0) +
        Math.max(0, specific.hitModifier ?? 0),
      phase,
    }
  }
  const attacks = attacker
    ? combatAttacks(attacker, { keywords: defender ? combatUnitKeywords(defender) : [], rules: defenceRules }, preferences, excluded)
    : null
  const weaponAdjustment = (phase: CombatPhase, adjustments: CombatAdjustments) =>
    combineWeaponAdjustments(adjustments.weapons?.all ?? {}, adjustments.weapons?.[phase] ?? {})
  const scenario = (phase: CombatPhase, adjustments: CombatAdjustments): CombatInput | null => {
    const defences = defencesIn(phase, adjustments)
    if (!attacks || attacker?.allocationRequired || attacker?.companions?.some((member) => member.allocationRequired) || !defences)
      return null
    const phaseTarget = withExtraFeelNoPain(defences, adjustments)
    const resolvedOptions = options(phase, adjustments)
    return (
      combatAttackInput(attacks[phase], phaseTarget, resolvedOptions, weaponAdjustment(phase, adjustments)) ??
      (attacks[phase].base?.weapons.length === 0 && attacks[phase].base?.mortalWounds.length === 0
        ? { target: phaseTarget, weapons: [], options: resolvedOptions }
        : null)
    )
  }
  /** The dice result each attacking profile needs, with and without the -1 a shooting type costs it. */
  const hitRolls = (phase: CombatPhase, adjustments: CombatAdjustments) => {
    const input = scenario(phase, adjustments)
    const profileIds = attacks?.[phase].base?.profileIds ?? []
    return new Map(
      (input?.weapons ?? []).map((weapon, index) => [
        profileIds[index]!,
        {
          needed: hitRollNeeded(weapon, input!.options),
          withoutPenalty: hitRollNeeded({ ...weapon, hitModifier: (weapon.hitModifier ?? 0) + 1 }, input!.options),
        },
      ]),
    )
  }
  const phaseSetup = (phase: CombatPhase, adjustments: CombatAdjustments) => {
    const defences = defencesIn(phase, adjustments)
    return defences
      ? {
          target: withExtraFeelNoPain(defences, adjustments),
          options: options(phase, adjustments),
          adjustment: weaponAdjustment(phase, adjustments),
        }
      : null
  }
  return {
    target,
    labels,
    attackRules,
    defenceRules,
    defencesIn,
    inheritedOptions,
    options,
    attacks,
    plans: { ranged: attacks?.ranged.plan ?? null, melee: attacks?.melee.plan ?? null },
    scenario,
    hitRolls,
    phaseSetup,
    sequenceError: defender ? combatUnitSequenceError(defender, target?.target?.groups) : undefined,
  }
}

const resolved = (calculate: () => CombatResult) => {
  try {
    return { result: calculate() }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'The simulation failed.' }
  }
}

/** Each requested phase alone, then shooting carried into melee when both resolve and the sequence is supported. */
export function resolveCombatRequest(request: CombatRequest, maxWork?: number): CombatAnswer {
  const answer: CombatAnswer = {
    ranged: request.ranged ? resolved(() => calculateCombat(request.ranged!, maxWork)) : null,
    melee: request.melee ? resolved(() => calculateCombat(request.melee!, maxWork)) : null,
  }
  if (request.ranged && request.melee && answer.ranged?.result && answer.melee?.result)
    answer.combined = request.sequenceError
      ? { error: request.sequenceError }
      : resolved(() => calculateCombatSequence([request.ranged!, request.melee!], maxWork, [[], request.meleeAfterLosses]))
  return answer
}

import {
  DEFAULT_COMBAT_OPTIONS,
  calculateCombat,
  calculateCombatSequence,
  rerollRank,
  type CombatInput,
  type CombatOptions,
  type CombatResult,
} from './combat'
import { adjustCombatTarget, combineAttackAdjustments, combineWeaponAdjustments, type CombatAdjustments } from './combatAdjustments'
import { combatRuleDefences, combatRuleOptions } from './combatRules'
import { combatAttackInput, combatAttacks } from './combatScenario'
import { combatUnitKeywords, combatUnitSequenceError, combatUnitTarget, type CombatMember } from './combatUnit'

type Phase = CombatOptions['phase']
export type CombatantSnapshot = CombatMember & { ruleChoices?: Readonly<Record<string, number>> }
export type CombatMatchupChoices = {
  preferences: Readonly<Record<string, string>>
  excluded: Readonly<Record<Phase, readonly string[]>>
  /** Defence-group labels the player moved earlier in the allocation order. */
  allocation: readonly string[]
}
export type CombatRequest = Record<Phase, CombatInput | null> & { sequenceError?: string }
type CombatPhaseAnswer = { result?: CombatResult; error?: string } | null
export type CombatAnswer = Record<Phase, CombatPhaseAnswer> & { combined?: CombatPhaseAnswer }

/**
 * How one unit's attacks meet another: the defender's allocation order, both units' rule options, and the
 * calculation each phase makes once a set of situational adjustments is layered over them.
 */
export function combatMatchup(
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
  const unitDefences = (phase: Phase) => {
    if (!target?.target || !defender) return null
    if (!defender.companions?.length) return combatRuleDefences(target.target, defenceRules, phase, attackRules)
    const calculated = combatUnitTarget(defender, phase, attackRules)
    return calculated.target ? { ...calculated.target, groups: order.map((index) => calculated.target!.groups[index]!) } : null
  }
  const ruleDefences = { ranged: unitDefences('ranged'), melee: unitDefences('melee') }
  const defencesIn = (phase: Phase, adjustments: CombatAdjustments) =>
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
  const attackOptions = {
    ranged: combatRuleOptions(attacker?.companions?.length ? [] : attackRules, 'attacker', 'ranged'),
    melee: combatRuleOptions(attacker?.companions?.length ? [] : attackRules, 'attacker', 'melee'),
  }
  const defenceOptions = {
    ranged: combatRuleOptions(defenceRules, 'defender', 'ranged'),
    melee: combatRuleOptions(defenceRules, 'defender', 'melee'),
  }
  const inherited = {
    ranged: { ...DEFAULT_COMBAT_OPTIONS, ...attackOptions.ranged, ...defenceOptions.ranged },
    melee: { ...DEFAULT_COMBAT_OPTIONS, ...attackOptions.melee, ...defenceOptions.melee },
  }
  const inheritedOptions = (phase: Phase) => inherited[phase]
  const options = (phase: Phase, adjustments: CombatAdjustments): CombatOptions => {
    const attack = attackOptions[phase]
    const defence = defenceOptions[phase]
    const base = inheritedOptions(phase)
    const shared = adjustments.all ?? {}
    const specific = adjustments[phase] ?? {}
    const extra = combineAttackAdjustments(shared, specific)
    const better = (field: 'hitReroll' | 'woundReroll') =>
      rerollRank[extra[field] ?? 'none'] > rerollRank[base[field]] ? extra[field]! : base[field]
    return {
      ...base,
      cover: base.cover || Boolean(extra.cover),
      halfRange: base.halfRange || Boolean(extra.halfRange),
      heavy: base.heavy || Boolean(extra.heavy),
      charged: base.charged || Boolean(extra.charged),
      lethal: extra.lethal ?? base.lethal,
      indirectFire: extra.indirectFire ?? base.indirectFire,
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
  const weaponAdjustment = (phase: Phase, adjustments: CombatAdjustments) =>
    combineWeaponAdjustments(adjustments.weapons?.all ?? {}, adjustments.weapons?.[phase] ?? {})
  const scenario = (phase: Phase, adjustments: CombatAdjustments): CombatInput | null => {
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
  const phaseSetup = (phase: Phase, adjustments: CombatAdjustments) => {
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
      : resolved(() => calculateCombatSequence([request.ranged!, request.melee!], maxWork))
  return answer
}

import {
  COMBAT_PHASES,
  criticalThresholdMatters,
  halfRangeMatters,
  rerollAdjustmentMatters,
  rerollRank,
  rollAdjustmentMatters,
  saveAdjustmentMatters,
  type CombatOptions,
  type CombatPhase,
} from '../../../core/combat'
import type { combatMatchup, CombatRequest } from '../../../core/combatMatchup'
import type { CombatAdjustments, TargetAdjustment, WeaponAdjustment } from '../../../core/combatAdjustments'
import { formatList, signedLabel } from '../../text'
import { PHASE_TITLES } from './CombatControls'

export type CombatMatchupView = ReturnType<typeof combatMatchup>
export type PhaseScope = CombatPhase | 'all'
type AdjustmentSource = 'attack' | 'weapon' | 'target' | 'feelNoPain'

export const sustainedKey = (amount: WeaponAdjustment['sustained']) =>
  amount === undefined ? undefined : typeof amount === 'number' ? String(amount) : 'D3'
export const commandRerolls = [
  ['hit', 'Hit roll'],
  ['wound', 'Wound roll'],
  ['save', 'Save roll'],
  ['attacks', 'Attacks roll'],
  ['damage', 'Damage roll'],
] as const
const commandRerollLabels = Object.fromEntries(commandRerolls)
/** The same settings with no Command Re-roll, so the results can show what spending it changes. */
export const withoutCommandReroll = (settings: CombatAdjustments): CombatAdjustments => ({
  ...settings,
  ...Object.fromEntries(
    (['all', 'ranged', 'melee'] as const).flatMap((scope) =>
      settings[scope] ? [[scope, { ...settings[scope], commandReroll: undefined }]] : [],
    ),
  ),
})
export const grants = [
  ['lethal', 'Lethal Hits'],
  ['devastating', 'Devastating Wounds'],
  ['damageReroll', 'Re-roll damage 1s'],
] as const
export const phases = COMBAT_PHASES.map((phase) => [phase, PHASE_TITLES[phase]] as const)

/** Whether each manual modifier changes the calculation, why not, and what the calculation applies, for the current settings. */
export function matchupModifiers(matchup: CombatMatchupView, adjustments: CombatAdjustments, scenarios: CombatRequest) {
  const { inheritedOptions } = matchup
  const options = (phase: CombatPhase) => matchup.options(phase, adjustments)
  const weaponAdjustment = (scope: PhaseScope) => adjustments.weapons?.[scope] ?? {}
  const adjustmentValue = (scope: PhaseScope, source: AdjustmentSource, field: string) =>
    source === 'weapon'
      ? adjustments.weapons?.[scope]?.[field as keyof WeaponAdjustment]
      : source === 'target'
        ? adjustments.target?.[field as keyof TargetAdjustment]
        : source === 'feelNoPain'
          ? adjustments.feelNoPain
          : adjustments[scope]?.[field as keyof Omit<CombatOptions, 'phase'>]
  const modifierChoiceHasEffect = (
    scope: PhaseScope,
    source: AdjustmentSource,
    field: string,
    candidate: unknown,
    onlyPhase?: CombatPhase,
  ) => {
    const affected = onlyPhase
      ? [onlyPhase]
      : scope === 'all' || source === 'target' || source === 'feelNoPain'
        ? phases.map(([phase]) => phase)
        : [scope]
    if (!affected.some((phase) => scenarios[phase])) return true
    const currentValue = adjustmentValue(scope, source, field)
    const nextValue = currentValue === candidate ? undefined : candidate
    const changed: CombatAdjustments =
      source === 'weapon'
        ? { ...adjustments, weapons: { ...adjustments.weapons, [scope]: { ...adjustments.weapons?.[scope], [field]: nextValue } } }
        : source === 'target'
          ? { ...adjustments, target: { ...adjustments.target, [field]: nextValue } }
          : source === 'feelNoPain'
            ? { ...adjustments, feelNoPain: nextValue as number | null | undefined }
            : { ...adjustments, [scope]: { ...adjustments[scope], [field]: nextValue } }
    return affected.some((phase) => {
      const current = scenarios[phase]
      const next = matchup.scenario(phase, changed)
      if (!current || !next) return Boolean(current || next)
      if (field === 'criticalHit' || field === 'criticalWound')
        return criticalThresholdMatters(current, next, field === 'criticalHit' ? 'hit' : 'wound')
      if (field === 'hitReroll' || field === 'woundReroll')
        return rerollAdjustmentMatters(current, next, field === 'hitReroll' ? 'hit' : 'wound')
      if (['hitModifier', 'woundModifier', 'skill', 'strength', 'cover', 'heavy', 'charged', 'toughness'].includes(field))
        return rollAdjustmentMatters(current, next, ['hitModifier', 'skill', 'cover', 'heavy'].includes(field) ? 'hit' : 'wound')
      if (field === 'ap' || field === 'save' || field === 'invulnerable') return saveAdjustmentMatters(current, next)
      if (field === 'halfRange') return halfRangeMatters(current) || halfRangeMatters(next)
      return JSON.stringify(current) !== JSON.stringify(next)
    })
  }
  const modifierHasEffect = (scope: PhaseScope, source: AdjustmentSource, field: string, onlyPhase?: CombatPhase) => {
    return modifierChoiceHasEffect(scope, source, field, adjustmentValue(scope, source, field), onlyPhase)
  }
  /** Why a chosen value changes nothing, or nothing when it does or nothing is chosen. */
  const noEffect = (scope: PhaseScope, source: AdjustmentSource, field: string, value: unknown) =>
    value === undefined || value === null || modifierChoiceHasEffect(scope, source, field, value)
      ? undefined
      : noEffectReason(scope, source, field, value)
  const noEffectReason = (scope: PhaseScope, source: AdjustmentSource, field: string, candidate?: unknown) => {
    const affected = scope === 'all' ? phases.map(([phase]) => phase) : [scope]
    const active = affected.flatMap((phase) => (scenarios[phase] ? [scenarios[phase]] : []))
    if (
      scope === 'all' &&
      source !== 'target' &&
      source !== 'feelNoPain' &&
      !['hitModifier', 'woundModifier', 'skill', 'strength', 'attacks', 'ap', 'damage'].includes(field)
    ) {
      const phaseChoices = source === 'weapon' ? adjustments.weapons : adjustments
      if (affected.every((phase) => Object.hasOwn(phaseChoices?.[phase] ?? {}, field)))
        return 'Shooting and Melee both override this All choice.'
    }
    if (field === 'criticalWound' && active.every((input) => input.weapons.every((weapon) => !weapon.devastating && !weapon.criticalAp)))
      return 'Those rolls already wound, and no included weapon has Devastating Wounds or another critical-wound effect.'
    if (field === 'criticalHit' && active.every((input) => input.weapons.every((weapon) => !weapon.lethal && !weapon.sustained)))
      return 'Those rolls already hit, and no included weapon has Lethal Hits or Sustained Hits.'
    if ((field === 'hitModifier' || field === 'woundModifier') && typeof candidate === 'number') {
      const selected = adjustments[scope]?.[field] === candidate
      if (
        affected.every((phase) => {
          const total = options(phase)[field]
          return candidate > 0 ? total >= (selected ? 2 : 1) : total <= (selected ? -2 : -1)
        })
      )
        return 'Bonuses and penalties combine before the roll modifier is capped at +1 or −1.'
    }
    if (field === 'hitReroll' || field === 'woundReroll') {
      const selected = candidate as CombatOptions['hitReroll'] | undefined
      if (selected && affected.every((phase) => rerollRank[inheritedOptions(phase)[field]] >= rerollRank[selected]))
        return 'An active unit rule already grants an equal or better re-roll.'
      return 'The included weapons already grant an equal or better re-roll.'
    }
    if (field === 'invulnerable' && typeof candidate === 'number') {
      const armourSaves = active.flatMap((input) =>
        input.target.groups.flatMap((group) =>
          input.weapons.flatMap((weapon) =>
            [weapon.ap, weapon.ap + (weapon.criticalAp ?? 0)].map((ap) => ({ printed: group.save, ap, needed: group.save - ap })),
          ),
        ),
      )
      if (armourSaves.length && armourSaves.every((save) => save.needed <= candidate)) {
        const worst = armourSaves.reduce((left, right) => (right.needed > left.needed ? right : left))
        return `The defender's ${worst.printed}+ armour save becomes ${worst.needed}+ against AP ${worst.ap < 0 ? '−' : '+'}${Math.abs(worst.ap)}, so ${candidate}++ does not improve it.`
      }
      return 'An invulnerable save does not change how these attacks are resolved.'
    }
    if (
      field === 'feelNoPain' &&
      typeof candidate === 'number' &&
      active.every((input) => input.target.feelNoPain && input.target.feelNoPain <= candidate)
    )
      return 'The defender already has an equal or better Feel No Pain roll.'
    if (field === 'halfRange') return 'No included weapon has Rapid Fire, Melta or Conversion.'
    if (field === 'sustained') return 'The included weapons already have equal or better Sustained Hits.'
    if (field === 'lethal' || field === 'devastating' || field === 'damageReroll') return 'The included weapons already have this ability.'
    return 'The current weapon rules, target, and other modifiers give the same result with or without this choice.'
  }
  const phaseSummary = (phase: CombatPhase) => {
    const applied: string[] = []
    const sourced: string[] = []
    const limits: string[] = []
    const add = (scope: PhaseScope, source: AdjustmentSource, field: string, label: string, value: unknown) => {
      if (value === undefined || value === null) return
      if (modifierHasEffect(scope, source, field, phase)) applied.push(label)
    }
    const sourceOptions = inheritedOptions(phase)
    const resolved = options(phase)
    if (sourceOptions.hitReroll !== 'none' && resolved.hitReroll === sourceOptions.hitReroll)
      sourced.push(`${sourceOptions.hitReroll === 'ones' ? 'Re-roll hit 1s' : 'Re-roll hits'} from rules`)
    if (sourceOptions.woundReroll !== 'none' && resolved.woundReroll === sourceOptions.woundReroll)
      sourced.push(`${sourceOptions.woundReroll === 'ones' ? 'Re-roll wound 1s' : 'Re-roll wounds'} from rules`)
    if (sourceOptions.singleRerolls?.length)
      sourced.push(`Re-roll ${formatList(sourceOptions.singleRerolls.map((kind) => `one ${kind} roll`))} from rules`)
    for (const scope of ['all', phase] as const) {
      const name = scope === 'all' ? 'All' : PHASE_TITLES[phase]
      const attack = adjustments[scope] ?? {}
      const weapon = weaponAdjustment(scope)
      for (const [field, label] of [
        ['hitModifier', 'to hit'],
        ['woundModifier', 'to wound'],
      ] as const) {
        const value = attack[field]
        if (value) applied.push(`${signedLabel(value)} ${label} (${name})`)
      }
      for (const [field, label] of [
        ['hitReroll', 'hit'],
        ['woundReroll', 'wound'],
      ] as const) {
        const value = attack[field]
        if (value)
          add(
            scope,
            'attack',
            field,
            `${value === 'none' ? 'No' : value === 'ones' ? 'Re-roll 1s for' : 'Re-roll all'} ${label} rolls (${name})`,
            value,
          )
      }
      if (attack.commandReroll)
        add(
          scope,
          'attack',
          'commandReroll',
          `Command Re-roll: ${commandRerollLabels[attack.commandReroll]!.toLowerCase()} (${name})`,
          attack.commandReroll,
        )
      for (const [field, label] of [
        ['cover', 'Cover'],
        ['halfRange', 'Half range'],
        ['heavy', 'Heavy'],
        ['charged', 'Charged'],
      ] as const) {
        if (attack[field]) add(scope, 'attack', field, `${label} (${name})`, true)
      }
      if (attack.indirectFire && attack.indirectFire !== 'direct')
        add(scope, 'attack', 'indirectFire', `Indirect fire: ${attack.indirectFire} (${name})`, attack.indirectFire)
      if (attack.lethal !== undefined)
        add(scope, 'attack', 'lethal', `${attack.lethal ? 'Lethal Hits' : 'Decline Lethal Hits'} (${name})`, attack.lethal)
      for (const [field, label] of [
        ['skill', phase === 'ranged' ? 'BS' : 'WS'],
        ['strength', 'Strength'],
        ['attacks', 'Attacks'],
        ['ap', 'AP'],
        ['damage', 'Damage'],
      ] as const) {
        const value = weapon[field]
        if (value) add(scope, 'weapon', field, `${signedLabel(value)} ${label} (${name})`, value)
      }
      if (weapon.criticalHit) add(scope, 'weapon', 'criticalHit', `Critical hits on ${weapon.criticalHit}+ (${name})`, weapon.criticalHit)
      if (weapon.criticalWound)
        add(scope, 'weapon', 'criticalWound', `Critical wounds on ${weapon.criticalWound}+ (${name})`, weapon.criticalWound)
      if (weapon.sustained !== undefined)
        add(
          scope,
          'weapon',
          'sustained',
          `${weapon.sustained === 0 ? 'No Sustained Hits' : `Sustained Hits ${sustainedKey(weapon.sustained)}`} (${name})`,
          weapon.sustained,
        )
      for (const [field, label] of grants)
        if (weapon[field] !== undefined) add(scope, 'weapon', field, `${weapon[field] ? label : `No ${label}`} (${name})`, weapon[field])
    }
    for (const [field, label] of [
      ['toughness', 'Toughness'],
      ['save', 'Save'],
    ] as const) {
      const value = adjustments.target?.[field]
      if (value) add('all', 'target', field, `${signedLabel(value)} defender ${label}`, value)
    }
    const targetAdjustments = adjustments.target
    if (targetAdjustments?.invulnerable)
      add('all', 'target', 'invulnerable', `Defender invulnerable save ${targetAdjustments.invulnerable}+`, targetAdjustments.invulnerable)
    if (targetAdjustments?.saveReroll)
      add(
        'all',
        'target',
        'saveReroll',
        `Defender re-roll ${targetAdjustments.saveReroll === 'ones' ? 'save 1s' : 'failed saves'}`,
        targetAdjustments.saveReroll,
      )
    if (targetAdjustments?.damageReduction) add('all', 'target', 'damageReduction', 'Defender −1 Damage', true)
    if (targetAdjustments?.halveDamage) add('all', 'target', 'halveDamage', 'Defender halves damage', true)
    if (adjustments.feelNoPain)
      add('all', 'feelNoPain', 'feelNoPain', `Defender Feel No Pain ${adjustments.feelNoPain}+`, adjustments.feelNoPain)
    if (adjustments.all?.hitModifier && adjustments[phase]?.hitModifier && resolved.hitModifier === 0)
      applied.push('Hit modifiers cancel to 0')
    if (adjustments.all?.woundModifier && adjustments[phase]?.woundModifier && resolved.woundModifier === 0)
      applied.push('Wound modifiers cancel to 0')
    for (const [roll, modifier] of [
      ['Hit', resolved.hitModifier],
      ['Wound', resolved.woundModifier],
    ] as const)
      if (Math.abs(modifier) > 1) limits.push(`${roll} roll modifier capped at ${modifier > 0 ? '+1' : '−1'}`)
    return [...sourced, applied.length ? `Manual: ${applied.join(', ')}` : 'No manual overrides', ...limits]
  }
  return { modifierChoiceHasEffect, noEffect, noEffectReason, phaseSummary }
}

export type MatchupModifiers = ReturnType<typeof matchupModifiers>

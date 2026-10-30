import { invalidWeaponChoices } from './combatPreferences'
import { calculateCombatPair } from './combatCalculation'
import { useEffect, useEffectEvent, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { posthog } from 'posthog-js'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { ArrowUp, RotateCcw } from 'lucide-react'
import { ProfileGrid, WeaponProfiles } from '../../components/DatasheetProfiles'
import type { Datasheet } from '../../../contracts/catalogue'
import {
  COMBAT_PHASES,
  combatGroupProtection,
  criticalThresholdMatters,
  halfRangeMatters,
  rerollAdjustmentMatters,
  rerollRank,
  rollAdjustmentMatters,
  saveAdjustmentMatters,
  type CombatInput,
  type CombatTargetGroup,
  type CombatOptions,
  type CombatPhase,
} from '../../../core/combat'
import { combatUnitKeywords, combatUnitTarget } from '../../../core/combatUnit'
import { combatMatchup, noExclusions, type CombatAnswer, type CombatantSnapshot, type CombatRequest } from '../../../core/combatMatchup'
import type { CombatAdjustments, TargetAdjustment, WeaponAdjustment } from '../../../core/combatAdjustments'
import { wargearKey } from '../../../core/wargear'
import { Chip, Choice, PHASE_TITLES, PhaseIcon } from './CombatControls'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CombatResults } from './CombatResults'
import { LoadoutOddsContext, LoadoutOptimizationContext, type LoadoutOptimization } from './LoadoutOdds'
import { useLoadoutOdds } from './useLoadoutOdds'
import type { MatchupSettings } from '../../../contracts/simulatorState'
import type { LoadoutSpace } from '../../../core/combatLoadouts'
import { groupBy } from '../../../core/collections'
import { Problem } from '../../components/Problem'
import { signedLabel } from '../../text'
import { useStableValue } from '../../useStableValue'
import { calculationInputs } from './calculationInputs'

function weaponToggleGroups(entries: readonly { profile: Datasheet['profiles'][number]; count: number }[]) {
  return [
    ...groupBy(
      entries.map(({ profile, count }) => ({ ...profile, count })),
      (profile) => wargearKey(profile.name, true),
    ),
  ]
}

type PhaseScope = CombatPhase | 'all'
type AdjustmentSource = 'attack' | 'weapon' | 'target' | 'feelNoPain'
type CombatEntryPoint = 'standalone' | 'roster' | 'battle'

export function combatOutcomeEvent(answer: CombatAnswer, source: CombatEntryPoint) {
  const shooting = Boolean(answer.ranged?.result)
  const melee = Boolean(answer.melee?.result)
  if (shooting || melee) return { name: 'combat_simulation_completed', properties: { source, shooting, melee } } as const
  if (answer.ranged?.error || answer.melee?.error)
    return { name: 'combat_simulation_failed', properties: { source, reason: 'calculation' } } as const
  return null
}
const sustainedAmounts: Record<string, WeaponAdjustment['sustained']> = {
  '1': 1,
  '2': 2,
  '3': 3,
  D3: { dice: 1, sides: 3, bonus: 0 },
}
const sustainedOptions = Object.keys(sustainedAmounts).map((key) => [key, `Sustained Hits ${key}`] as const)
const sustainedKey = (amount: WeaponAdjustment['sustained']) =>
  amount === undefined ? undefined : typeof amount === 'number' ? String(amount) : 'D3'
const rerollOptions = (roll: string, rolls: string) =>
  [
    ['ones', `Re-roll ${roll} 1s`],
    ['failed', `Re-roll ${rolls}`],
  ] as const
const hitRerolls = rerollOptions('hit', 'hits')
const woundRerolls = rerollOptions('wound', 'wounds')
const saveRerolls = rerollOptions('save', 'saves')
const grants = [
  ['lethal', 'Lethal Hits'],
  ['devastating', 'Devastating Wounds'],
  ['damageReroll', 'Re-roll damage 1s'],
] as const
const signedOptions = (values: readonly number[], name: string) => values.map((value) => [value, `${signedLabel(value)} ${name}`] as const)
const rollOptions = (values: readonly number[], prefix: string) => values.map((value) => [value, `${prefix}${value}+`] as const)
const situations = {
  ranged: [
    ['cover', 'Cover (−1 BS)'],
    ['halfRange', 'Half range'],
    ['heavy', 'Heavy'],
  ],
  melee: [['charged', 'Charged']],
} as const
const phases = COMBAT_PHASES.map((phase) => [phase, PHASE_TITLES[phase]] as const)

/** The same matchup surface accepts catalogue picks or already evaluated roster/battle units. */
export function CombatMatchup({
  entryPoint = 'standalone',
  attacker,
  defender,
  pending = false,
  failed = false,
  attackerControl,
  defenderControl,
  attackerBuffs,
  defenderBuffs,
  inDialog = false,
  loadoutSpace,
  initialSettings,
  onSettingsChange,
  onCompleted,
  preferences,
  invalidatedPreferences = false,
  onPreferencesChange: setPreferences,
  invalidAttachments,
}: {
  entryPoint?: CombatEntryPoint
  attacker: CombatantSnapshot | null
  defender: CombatantSnapshot | null
  pending?: boolean
  failed?: boolean
  attackerControl: ReactNode
  defenderControl: ReactNode
  attackerBuffs: ReactNode
  defenderBuffs: ReactNode
  inDialog?: boolean
  /** Situational settings restored from a shared link, and where to report changes. */
  initialSettings?: MatchupSettings
  onSettingsChange?: (settings: MatchupSettings) => void
  onCompleted?: () => void
  preferences: Record<string, string>
  invalidatedPreferences?: boolean
  onPreferencesChange: Dispatch<SetStateAction<Record<string, string>>>
  /** The attacker's weapon choices, when its loadout can change in this matchup. */
  loadoutSpace?: LoadoutSpace | null
  /** Which sides have illegal attachments, such as a Support unit without a Bodyguard unit, so they cannot be calculated. */
  invalidAttachments: { attacker?: boolean; defender?: boolean }
}) {
  const [adjustments, setAdjustments] = useState<CombatAdjustments>(initialSettings?.adjustments ?? {})
  const [modifiersOpen, setModifiersOpen] = useState(Boolean(Object.keys(initialSettings?.adjustments ?? {}).length))
  const [excludedWeapons, setExcludedWeapons] = useState<Record<CombatPhase, string[]>>(initialSettings?.excluded ?? noExclusions())
  const [outcome, setOutcome] = useState<{ key: string; attempt: number; answer: CombatAnswer } | null>(null)
  const [retry, setRetry] = useState(0)
  const [invalidatedChoice, setInvalidatedChoice] = useState(false)
  const reported = useRef(false)
  const completed = useEffectEvent(() => onCompleted?.())
  const failureReported = useRef(false)
  const [allocation, setAllocation] = useState<readonly string[]>(initialSettings?.allocation ?? [])
  useEffect(() => {
    onSettingsChange?.({ adjustments, preferences, excluded: excludedWeapons, allocation: [...allocation] })
  }, [adjustments, preferences, excludedWeapons, allocation, onSettingsChange])
  const matchup = useMemo(
    () => combatMatchup(attacker, defender, { preferences, excluded: excludedWeapons, allocation }),
    [attacker, defender, preferences, excludedWeapons, allocation],
  )
  const { target, labels, attackRules, defenceRules, inheritedOptions, plans, sequenceError } = matchup
  const invalidChoices = useStableValue(
    !pending && !failed && !attacker?.allocationRequired
      ? phases.flatMap(([phase]) => (plans[phase]?.errors.length ? [] : invalidWeaponChoices(preferences, plans[phase]?.choices ?? [])))
      : [],
  )
  // The notice that a choice stopped applying stays until the player picks again, after the choice itself is dropped.
  if (!invalidatedChoice && ((invalidatedPreferences && !pending && !failed) || invalidChoices.length)) setInvalidatedChoice(true)
  useEffect(() => {
    if (invalidChoices.length)
      setPreferences((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !invalidChoices.includes(key))))
  }, [invalidChoices, setPreferences])
  const allocateEarlier = (index: number) =>
    setAllocation(labels.map((label, at) => (at === index - 1 ? labels[index]! : at === index ? labels[index - 1]! : label)))
  const defencesIn = (phase: CombatPhase, settings: CombatAdjustments = adjustments) => matchup.defencesIn(phase, settings)
  const rangedDefences = defencesIn('ranged')
  const meleeDefences = defencesIn('melee')
  const extraFeelNoPain = adjustments.feelNoPain ?? null
  const betterFeelNoPain = (printed: number | null | undefined) =>
    extraFeelNoPain && (!printed || extraFeelNoPain < printed) ? extraFeelNoPain : (printed ?? null)
  const feelNoPain = betterFeelNoPain(
    rangedDefences?.feelNoPain === meleeDefences?.feelNoPain ? rangedDefences?.feelNoPain : target?.target?.feelNoPain,
  )
  const options = (phase: CombatPhase, settings: CombatAdjustments = adjustments) => matchup.options(phase, settings)
  const scenario = (phase: CombatPhase, settings: CombatAdjustments = adjustments) => matchup.scenario(phase, settings)
  const scenarios = useMemo<CombatRequest>(
    () => ({ ranged: matchup.scenario('ranged', adjustments), melee: matchup.scenario('melee', adjustments), sequenceError }),
    [matchup, adjustments, sequenceError],
  )
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
      const next = scenario(phase, changed)
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
    if (field === 'halfRange') return 'No included weapon has Rapid Fire or Melta.'
    if (field === 'sustained') return 'The included weapons already have equal or better Sustained Hits.'
    if (field === 'lethal' || field === 'devastating' || field === 'damageReroll') return 'The included weapons already have this ability.'
    return 'The current weapon rules, target, and other modifiers give the same result with or without this choice.'
  }
  const requestKey = JSON.stringify(scenarios)
  const canSimulate = Boolean(scenarios.ranged || scenarios.melee)
  const updating = pending || (canSimulate && (outcome?.key !== requestKey || outcome?.attempt !== retry))
  useEffect(() => {
    if (pending || failed) return
    const request = JSON.parse(requestKey) as CombatRequest
    if (!request.ranged && !request.melee) return
    const controller = new AbortController()
    void calculateCombatPair(request, controller.signal)
      .then((answer) => {
        if (controller.signal.aborted) return
        setOutcome({ key: requestKey, attempt: retry, answer })
        const telemetry = combatOutcomeEvent(answer, entryPoint)
        if (telemetry?.name === 'combat_simulation_completed') completed()
        if (telemetry?.name === 'combat_simulation_completed' && !reported.current) {
          reported.current = true
          posthog.capture(telemetry.name, telemetry.properties)
        } else if (telemetry?.name === 'combat_simulation_failed' && !failureReported.current) {
          failureReported.current = true
          posthog.capture(telemetry.name, telemetry.properties)
        }
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setOutcome({
          key: requestKey,
          attempt: retry,
          answer: {
            ranged: request.ranged ? { error: 'The calculation failed. Try again.' } : null,
            melee: request.melee ? { error: 'The calculation failed. Try again.' } : null,
          },
        })
        if (!failureReported.current) {
          failureReported.current = true
          posthog.capture('combat_simulation_failed', { source: entryPoint, reason: 'calculation' })
        }
      })
    const stop = () => controller.abort()
    return stop
  }, [requestKey, pending, failed, retry, entryPoint])
  // After the estimate's effect, so the matchup's own calculation starts first.
  const loadoutScoring = useMemo(
    () =>
      attacker && defender && !attacker.allocationRequired && !pending && !failed
        ? {
            sheet: attacker.sheet,
            carriers: attacker.carriers,
            models: attacker.models,
            rules: attackRules,
            ruleChoices: attacker.ruleChoices,
            companions: attacker.companions,
            sequenceError,
            opponent: { keywords: combatUnitKeywords(defender), rules: defenceRules },
            preferences,
            excluded: excludedWeapons,
            phases: { ranged: matchup.phaseSetup('ranged', adjustments), melee: matchup.phaseSetup('melee', adjustments) },
          }
        : null,
    [attacker, defender, pending, failed, attackRules, sequenceError, defenceRules, preferences, excludedWeapons, matchup, adjustments],
  )
  const loadoutOdds = useLoadoutOdds({
    space: loadoutSpace,
    scoring: loadoutScoring,
    expected: scenarios,
  })
  const optimizationKey = JSON.stringify({
    key: JSON.stringify([defender, adjustments, defenceRules, attacker?.models]),
    preferences,
    excluded: excludedWeapons,
    results:
      outcome?.key === requestKey
        ? {
            combined: outcome.answer.combined?.result,
            ranged: outcome.answer.ranged?.result,
            melee: outcome.answer.melee?.result,
          }
        : undefined,
    scoring: loadoutScoring,
    expected: scenarios,
  } satisfies Omit<LoadoutOptimization, 'apply'>)
  const optimizationContext = useMemo(
    () => ({
      ...(JSON.parse(optimizationKey) as Omit<LoadoutOptimization, 'apply'>),
      apply: (optimizedPreferences: Record<string, string>) => {
        setPreferences(optimizedPreferences)
        setInvalidatedChoice(false)
        setExcludedWeapons(noExclusions())
      },
    }),
    [optimizationKey, setPreferences],
  )
  const change = <K extends keyof CombatOptions>(scope: PhaseScope, name: K, value: CombatOptions[K] | undefined) =>
    setAdjustments((current) => ({ ...current, [scope]: { ...current[scope], [name]: value } }))
  const changeWeapon = <K extends keyof WeaponAdjustment>(scope: PhaseScope, name: K, value: WeaponAdjustment[K]) =>
    setAdjustments((current) => ({ ...current, weapons: { ...current.weapons, [scope]: { ...current.weapons?.[scope], [name]: value } } }))
  const changeTarget = <K extends keyof TargetAdjustment>(name: K, value: TargetAdjustment[K]) =>
    setAdjustments((current) => ({ ...current, target: { ...current.target, [name]: value } }))
  const weaponAdjustment = (scope: PhaseScope) => adjustments.weapons?.[scope] ?? {}
  const activeCount = (scope: PhaseScope) =>
    [...Object.values(adjustments[scope] ?? {}), ...Object.values(weaponAdjustment(scope))].filter(
      (value) => value !== undefined && value !== 'direct',
    ).length
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
  const sources = [
    ...new Set(
      [attacker, defender].flatMap((unit) =>
        [unit, ...(unit?.companions ?? [])].flatMap(
          (member) => member?.sheet.profiles.flatMap((profile) => profile.values.flatMap((value) => value.modifiers ?? [])) ?? [],
        ),
      ),
    ),
  ]
  return (
    <>
      <div className="@container min-w-0 border border-edge bg-panel" aria-label="Combat matchup">
        <div className="grid @xl:grid-cols-2">
          <section
            data-onboarding="simulator-attacker"
            aria-label="Attacker"
            className="min-w-0 border-b border-edge @xl:border-r @xl:border-b-0"
          >
            <LoadoutOddsContext.Provider value={loadoutOdds}>
              <LoadoutOptimizationContext.Provider value={optimizationContext}>{attackerControl}</LoadoutOptimizationContext.Provider>
            </LoadoutOddsContext.Provider>
            <CombatDefences unit={attacker} />
          </section>
          <section data-onboarding="simulator-defender" aria-label="Defender" className="min-w-0">
            {defenderControl}
            <CombatDefences
              unit={defender}
              feelNoPain={feelNoPain}
              configured={
                rangedDefences && meleeDefences && JSON.stringify(rangedDefences.groups) === JSON.stringify(meleeDefences.groups)
                  ? { target: rangedDefences, labels }
                  : undefined
              }
              onAllocateEarlier={allocateEarlier}
            />
          </section>
        </div>

        <div className="border-t border-edge p-3 sm:p-4">
          {!pending && !failed && (invalidatedPreferences || invalidatedChoice) ? (
            <output className="mb-3 block text-xs text-dim">
              Some previous weapon choices no longer apply to this equipment. Current profiles are used.
            </output>
          ) : null}
          {attacker?.allocationRequired ? (
            <p role="alert" className="mb-3 text-sm text-discarded">
              {invalidAttachments.attacker
                ? 'Fix the attacker’s attachments to calculate attacks.'
                : "Choose the attacker's surviving models and weapons to calculate attacks."}
            </p>
          ) : null}
          {target?.error ? (
            <Problem className="mb-3">
              {invalidAttachments.defender ? 'Fix the defender’s attachments to calculate attacks against it.' : target.error}
            </Problem>
          ) : null}
          <div className="grid gap-x-3 gap-y-6 @xl:grid-cols-2">
            {phases.map(([phase, title]) => {
              const plan = plans[phase]
              const answer = outcome?.answer[phase]
              const valid = Boolean(scenario(phase))
              const error = outcome?.key === requestKey ? answer?.error : undefined
              return (
                <section key={phase} aria-label={`${title} results`} aria-busy={valid && updating && !failed} className="min-w-0 space-y-2">
                  <h2 className="rubric flex items-center gap-2">
                    <PhaseIcon phase={phase} className="size-4" />
                    {title}
                  </h2>
                  {!plan?.used.length ? (
                    <p className="text-xs text-dim">
                      {attacker ? `No ${title.toLowerCase()} weapons equipped.` : 'Equipped weapons appear here.'}
                    </p>
                  ) : null}
                  {plan?.errors.map((message) => (
                    <p key={message} role="alert" className="mt-2 text-xs text-discarded">
                      {message}
                    </p>
                  ))}
                  {error ? (
                    <Problem className="mt-2 text-xs">
                      {error}{' '}
                      <Button size="sm" variant="outline" onClick={() => setRetry((value) => value + 1)}>
                        Retry
                      </Button>
                    </Problem>
                  ) : null}
                  <div className="space-y-2">
                    {plan?.choices.map((choice) => (
                      <Choice
                        key={choice.key}
                        label={choice.label}
                        value={choice.value}
                        choices={choice.options.map((option) => [option.value, option.label] as const)}
                        onChange={(value) => {
                          setInvalidatedChoice(false)
                          setPreferences((current) => ({ ...current, [choice.key]: value }))
                        }}
                      />
                    ))}
                    <div className="space-y-1.5">
                      {weaponToggleGroups(plan?.used ?? []).map(([key, group]) => {
                        const included = !excludedWeapons[phase].includes(key)
                        return (
                          <div key={group[0]!.id} data-weapon-card className="relative min-w-0 border border-edge bg-panel [&_h3]:pr-10">
                            <Switch
                              className="absolute top-2 right-3 z-10 border-edge data-checked:border-primary data-checked:bg-primary data-unchecked:bg-zinc-600 [&_[data-slot=switch-thumb]]:bg-white"
                              aria-label={`Include ${group[0]!.name} in ${title.toLowerCase()} calculation`}
                              checked={included}
                              onCheckedChange={(checked) =>
                                setExcludedWeapons((current) => ({
                                  ...current,
                                  [phase]: checked ? current[phase].filter((candidate) => candidate !== key) : [...current[phase], key],
                                }))
                              }
                            />
                            <div className={`min-w-0 ${included ? '' : 'opacity-50'}`}>
                              <WeaponProfiles weapons={group} rules={attacker?.sheet.keywordRules ?? []} embedded />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </section>
              )
            })}
          </div>
          <details data-combat-buffs className="mt-3 border-t border-edge">
            <summary className="rubric scroll-mt-header cursor-pointer py-3 text-info outline-none focus-visible:ring-2 focus-visible:ring-primary">
              Rules & buffs
            </summary>
            <div className="grid gap-4 pb-3 @xl:grid-cols-2">
              {attackerBuffs}
              {defenderBuffs}
            </div>
          </details>
          <section aria-label="Modifiers" className="border-t border-edge">
            <details data-manual-modifiers open={modifiersOpen} onToggle={(event) => setModifiersOpen(event.currentTarget.open)}>
              <summary className="rubric scroll-mt-header cursor-pointer py-3 text-info outline-none focus-visible:ring-2 focus-visible:ring-primary">
                Manual modifiers
              </summary>
              <div className="pb-3">
                <Tabs defaultValue="all" className="flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <h2 className="sr-only">Modifiers</h2>
                    <TabsList
                      aria-label="Attack modifiers"
                      className="h-11! min-w-[min(100%,24rem)] flex-1 border border-edge bg-raised p-1"
                    >
                      {([['all', 'All'], ...phases] as const).map(([scope, title]) => {
                        const active = activeCount(scope)
                        return (
                          <TabsTrigger
                            key={scope}
                            value={scope}
                            className="min-w-0 px-2 text-sm font-semibold data-active:bg-panel data-active:text-primary"
                          >
                            {scope === 'all' ? null : <PhaseIcon phase={scope} />}
                            {title}
                            {active ? <span className="readout text-xs text-primary">{active}</span> : null}
                          </TabsTrigger>
                        )
                      })}
                    </TabsList>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="@max-[31rem]:order-first"
                      onClick={() => {
                        setAdjustments({})
                        setPreferences({})
                        setInvalidatedChoice(false)
                        setExcludedWeapons(noExclusions())
                      }}
                    >
                      <RotateCcw aria-hidden />
                      Reset
                    </Button>
                  </div>
                  {([['all', 'All'], ...phases] as const).map(([scope, title]) => {
                    const weapon = weaponAdjustment(scope)
                    const set =
                      <K extends keyof WeaponAdjustment>(field: K) =>
                      (value: WeaponAdjustment[K]) =>
                        changeWeapon(scope, field, value)
                    const skill = scope === 'ranged' ? 'BS' : scope === 'melee' ? 'WS' : 'BS/WS'
                    return (
                      <TabsContent key={scope} value={scope} aria-label={`${title} modifiers`} className="space-y-2.5">
                        <ChipRow label="Rolls">
                          <ChipFamily
                            value={adjustments[scope]?.hitModifier}
                            options={signedOptions([1, -1], 'Hit')}
                            onChange={(value) => change(scope, 'hitModifier', value)}
                            ineffective={(option) => !modifierChoiceHasEffect(scope, 'attack', 'hitModifier', option)}
                            reason={(option) => noEffectReason(scope, 'attack', 'hitModifier', option)}
                          />
                          <ChipFamily
                            value={adjustments[scope]?.woundModifier}
                            options={signedOptions([1, -1], 'Wound')}
                            onChange={(value) => change(scope, 'woundModifier', value)}
                            ineffective={(option) => !modifierChoiceHasEffect(scope, 'attack', 'woundModifier', option)}
                            reason={(option) => noEffectReason(scope, 'attack', 'woundModifier', option)}
                          />
                          <ChipFamily
                            value={adjustments[scope]?.hitReroll}
                            options={
                              scope !== 'all' && adjustments.all?.hitReroll
                                ? ([...hitRerolls, ['none', 'No hit re-roll']] as const)
                                : hitRerolls
                            }
                            onChange={(value) => change(scope, 'hitReroll', value)}
                            ineffective={(option) => !modifierChoiceHasEffect(scope, 'attack', 'hitReroll', option)}
                            reason={(option) => noEffectReason(scope, 'attack', 'hitReroll', option)}
                          />
                          <ChipFamily
                            value={adjustments[scope]?.woundReroll}
                            options={
                              scope !== 'all' && adjustments.all?.woundReroll
                                ? ([...woundRerolls, ['none', 'No wound re-roll']] as const)
                                : woundRerolls
                            }
                            onChange={(value) => change(scope, 'woundReroll', value)}
                            ineffective={(option) => !modifierChoiceHasEffect(scope, 'attack', 'woundReroll', option)}
                            reason={(option) => noEffectReason(scope, 'attack', 'woundReroll', option)}
                          />
                          <ChipFamily
                            value={weapon.criticalHit}
                            options={rollOptions(
                              scope !== 'all' && adjustments.weapons?.all?.criticalHit ? [5, 4, 6] : [5, 4],
                              'Crit hits ',
                            )}
                            onChange={set('criticalHit')}
                            ineffective={(option) => !modifierChoiceHasEffect(scope, 'weapon', 'criticalHit', option)}
                            reason={(option) => noEffectReason(scope, 'weapon', 'criticalHit', option)}
                          />
                          <ChipFamily
                            value={weapon.criticalWound}
                            options={rollOptions(
                              scope !== 'all' && adjustments.weapons?.all?.criticalWound ? [5, 4, 3, 2, 6] : [5, 4, 3, 2],
                              'Crit wounds ',
                            )}
                            onChange={set('criticalWound')}
                            ineffective={(option) => !modifierChoiceHasEffect(scope, 'weapon', 'criticalWound', option)}
                            reason={(option) => noEffectReason(scope, 'weapon', 'criticalWound', option)}
                          />
                        </ChipRow>
                        <ChipRow label="Stats">
                          <ChipFamily
                            value={weapon.skill}
                            options={signedOptions([1, -1], skill)}
                            onChange={set('skill')}
                            ineffective={(option) => !modifierChoiceHasEffect(scope, 'weapon', 'skill', option)}
                          />
                          <ChipFamily
                            value={weapon.strength}
                            options={signedOptions([1, 2, 3, -1], 'S')}
                            onChange={set('strength')}
                            ineffective={(option) => !modifierChoiceHasEffect(scope, 'weapon', 'strength', option)}
                          />
                          <ChipFamily
                            value={weapon.attacks}
                            options={signedOptions([1, 2, -1], 'A')}
                            onChange={set('attacks')}
                            ineffective={(option) => !modifierChoiceHasEffect(scope, 'weapon', 'attacks', option)}
                          />
                          <ChipFamily
                            value={weapon.ap}
                            options={signedOptions([1, 2, -1], 'AP')}
                            onChange={set('ap')}
                            ineffective={(option) => !modifierChoiceHasEffect(scope, 'weapon', 'ap', option)}
                          />
                          <ChipFamily
                            value={weapon.damage}
                            options={signedOptions([1, 2, -1], 'D')}
                            onChange={set('damage')}
                            ineffective={(option) => !modifierChoiceHasEffect(scope, 'weapon', 'damage', option)}
                          />
                        </ChipRow>
                        <ChipRow label="Abilities">
                          <ChipFamily
                            value={sustainedKey(weapon.sustained)}
                            options={
                              scope !== 'all' && adjustments.weapons?.all?.sustained
                                ? [...sustainedOptions, ['0', 'No Sustained Hits']]
                                : sustainedOptions
                            }
                            onChange={(value) =>
                              changeWeapon(
                                scope,
                                'sustained',
                                value === undefined ? undefined : value === '0' ? 0 : sustainedAmounts[value],
                              )
                            }
                            ineffective={(option) =>
                              !modifierChoiceHasEffect(scope, 'weapon', 'sustained', option === '0' ? 0 : sustainedAmounts[option])
                            }
                          />
                          {grants.map(([field, name]) => (
                            <ChipFamily
                              key={field}
                              value={weapon[field]}
                              options={
                                scope !== 'all' && adjustments.weapons?.all?.[field]
                                  ? [
                                      [true, name],
                                      [false, `No ${name}`],
                                    ]
                                  : [[true, name]]
                              }
                              onChange={set(field)}
                              ineffective={(option) => !modifierChoiceHasEffect(scope, 'weapon', field, option)}
                            />
                          ))}
                        </ChipRow>
                        {scope === 'all' ? null : (
                          <ChipRow label="Situation">
                            {situations[scope].map(([field, label]) => (
                              <span key={field} className="inline-flex items-center gap-1">
                                <Chip
                                  label={label}
                                  checked={inheritedOptions(scope)[field] || Boolean(adjustments[scope]?.[field])}
                                  disabled={inheritedOptions(scope)[field]}
                                  onChange={(value) => change(scope, field, value ? true : undefined)}
                                  ineffectiveReason={
                                    !inheritedOptions(scope)[field] && !modifierChoiceHasEffect(scope, 'attack', field, true)
                                      ? noEffectReason(scope, 'attack', field)
                                      : undefined
                                  }
                                />
                              </span>
                            ))}
                            {scope === 'ranged' && plans.ranged?.weapons.some((entry) => entry.indirectFire) ? (
                              <ChipFamily
                                value={adjustments.ranged?.indirectFire === 'direct' ? undefined : adjustments.ranged?.indirectFire}
                                options={
                                  [
                                    ['unobserved', 'Indirect, unobserved or moving'],
                                    ['spotted', 'Indirect, stationary and spotted'],
                                  ] as const
                                }
                                onChange={(value) => change('ranged', 'indirectFire', value ?? 'direct')}
                                ineffective={(option) => !modifierChoiceHasEffect('ranged', 'attack', 'indirectFire', option)}
                              />
                            ) : null}
                            {plans[scope]?.weapons.some((entry) => entry.lethal) ? (
                              <Chip
                                label="Decline Lethal Hits"
                                checked={!options(scope).lethal}
                                onChange={(value) => change(scope, 'lethal', !value)}
                              />
                            ) : null}
                          </ChipRow>
                        )}
                      </TabsContent>
                    )
                  })}
                </Tabs>
                <div className="mt-3 space-y-2.5 border-t border-edge pt-3">
                  <h3 className="rubric">Defender</h3>
                  <ChipRow label="Stats">
                    <ChipFamily
                      value={adjustments.target?.toughness}
                      options={signedOptions([1, -1], 'T')}
                      onChange={(value) => changeTarget('toughness', value)}
                      ineffective={(option) => !modifierChoiceHasEffect('all', 'target', 'toughness', option)}
                    />
                    <ChipFamily
                      value={adjustments.target?.save}
                      options={signedOptions([1, -1], 'Sv')}
                      onChange={(value) => changeTarget('save', value)}
                      ineffective={(option) => !modifierChoiceHasEffect('all', 'target', 'save', option)}
                    />
                  </ChipRow>
                  <ChipRow label="Protection">
                    <ChipFamily
                      value={adjustments.target?.invulnerable ?? undefined}
                      options={[6, 5, 4, 3].map((roll) => [roll, `${roll}++`] as const)}
                      onChange={(value) => changeTarget('invulnerable', value)}
                      ineffective={(option) => !modifierChoiceHasEffect('all', 'target', 'invulnerable', option)}
                      reason={(option) => noEffectReason('all', 'target', 'invulnerable', option)}
                    />
                    <ChipFamily
                      value={extraFeelNoPain ?? undefined}
                      options={rollOptions([6, 5, 4, 3, 2], 'FNP ')}
                      onChange={(value) => setAdjustments((current) => ({ ...current, feelNoPain: value ?? null }))}
                      ineffective={(option) => !modifierChoiceHasEffect('all', 'feelNoPain', 'feelNoPain', option)}
                    />
                    <ChipFamily
                      value={adjustments.target?.saveReroll}
                      options={saveRerolls}
                      onChange={(value) => changeTarget('saveReroll', value)}
                      ineffective={(option) => !modifierChoiceHasEffect('all', 'target', 'saveReroll', option)}
                    />
                    <ChipFamily
                      value={adjustments.target?.damageReduction}
                      options={[[true, '−1 Damage']]}
                      onChange={(value) => changeTarget('damageReduction', value)}
                      ineffective={(option) => !modifierChoiceHasEffect('all', 'target', 'damageReduction', option)}
                    />
                    <ChipFamily
                      value={adjustments.target?.halveDamage}
                      options={[[true, 'Half damage']]}
                      onChange={(value) => changeTarget('halveDamage', value)}
                      ineffective={(option) => !modifierChoiceHasEffect('all', 'target', 'halveDamage', option)}
                    />
                  </ChipRow>
                </div>
              </div>
            </details>
            <section aria-label="Applied modifiers" className="space-y-2 border-t border-edge pt-3 text-xs">
              <h3 className="rubric">Calculation uses</h3>
              {sources.length ? <p className="text-dim">Profile changes: {sources.join(' · ')}.</p> : null}
              {phases.map(([phase, title]) => {
                const plan = plans[phase]
                const excluded = weaponToggleGroups(plan?.used ?? []).flatMap(([key, group]) =>
                  excludedWeapons[phase].includes(key) ? [group[0]!.name] : [],
                )
                const applied = [
                  ...calculationInputs(phase, { attacker, defender, choices: plan?.choices ?? [], excluded }),
                  ...phaseSummary(phase),
                ]
                return (
                  <div key={phase}>
                    <p className="font-semibold text-bone">{title}</p>
                    <ul className="mt-0.5 space-y-0.5 text-dim">
                      {(scenarios[phase] ? applied : ['No attack calculated']).map((entry) => (
                        <li key={entry}>{entry}</li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </section>
          </section>
        </div>
        {outcome?.key === requestKey && outcome.answer.combined?.error ? (
          <Problem className="mt-3">
            Combined estimate: {outcome.answer.combined.error}
            <Button className="ml-2" size="sm" variant="outline" onClick={() => setRetry((value) => value + 1)}>
              Retry
            </Button>
          </Problem>
        ) : null}
      </div>
      <CombatResults
        ranged={scenarios.ranged ? outcome?.answer.ranged?.result : undefined}
        melee={scenarios.melee ? outcome?.answer.melee?.result : undefined}
        combined={scenarios.ranged && scenarios.melee ? outcome?.answer.combined?.result : undefined}
        updating={updating}
        failed={failed}
        inDialog={inDialog}
        selected={Boolean(attacker && defender)}
        supported={Boolean(scenarios.ranged && scenarios.melee)}
      />
    </>
  )
}

function CombatDefences({
  unit,
  feelNoPain,
  configured,
  onAllocateEarlier,
}: {
  unit: CombatantSnapshot | null
  feelNoPain?: number | null
  configured?: { target: CombatInput['target']; labels: readonly string[] }
  onAllocateEarlier?: (index: number) => void
}) {
  const printed = configured ?? (unit ? combatUnitTarget(unit) : null)
  const target = printed?.target ?? null
  const fnp = feelNoPain === undefined ? target?.feelNoPain : feelNoPain
  const groups = target?.groups ?? []
  const values = (group: CombatTargetGroup | undefined) => {
    const protection = group && target ? combatGroupProtection(target, group).feelNoPain : null
    const threshold = Math.min(protection ?? 7, fnp ?? 7)
    return [
      { name: 'T', value: group ? String(group.toughness) : '—' },
      { name: 'Sv', value: group ? `${group.save}+` : '—' },
      { name: 'W', value: group ? String(group.wounds) : '—' },
      { name: 'InSv', value: group?.invulnerable ? `${group.invulnerable}+` : '—' },
      { name: 'FNP', value: threshold < 7 ? `${threshold}+` : '—' },
    ]
  }
  if (groups.length < 2)
    return (
      <div className="px-3 pb-3 sm:px-4 sm:pb-4">
        <ProfileGrid values={values(groups[0])} columns={5} />
      </div>
    )
  return (
    <div className="px-3 pb-3 sm:px-4 sm:pb-4">
      <table className="w-full table-fixed border border-edge bg-card text-center">
        <thead>
          <tr className="eyebrow">
            <th className="w-1/3 px-2 py-1.5 text-left font-normal">{onAllocateEarlier ? 'Order' : 'Models'}</th>
            {values(groups[0]).map((value) => (
              <th key={value.name} className="px-1 py-1.5 font-normal">
                {value.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((group, index) => {
            const label = printed?.labels[index]
            return (
              <tr key={label ?? index} className="border-t border-edge">
                <td className="px-2 py-1.5 text-left text-xs text-dim">
                  <div className="flex min-w-0 items-center gap-1">
                    <span className="min-w-0 truncate">
                      {onAllocateEarlier ? `${index + 1}. ` : ''}
                      {label} ×{group.models}
                    </span>
                    {onAllocateEarlier &&
                    index > 0 &&
                    Boolean(group.character) === Boolean(groups[index - 1]!.character) &&
                    Boolean(group.damage) === Boolean(groups[index - 1]!.damage) ? (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="ml-auto shrink-0"
                        aria-label={`Allocate to ${label} earlier`}
                        onClick={() => onAllocateEarlier(index)}
                      >
                        <ArrowUp aria-hidden />
                      </Button>
                    ) : null}
                  </div>
                </td>
                {values(group).map((value) => (
                  <td key={value.name} className="readout px-1 py-1.5 text-base">
                    {value.value}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function ChipRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5 @md:grid-cols-[7rem_minmax(0,1fr)] @md:items-start">
      <span className="eyebrow text-faint @md:pt-2">{label}</span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  )
}

/** Mutually exclusive choices; pressing the chosen one again returns to the unit's own value. */
function ChipFamily<T>({
  value,
  options,
  onChange,
  ineffective,
  reason,
}: {
  value: T | undefined
  options: readonly (readonly [T, string])[]
  onChange: (value: T | undefined) => void
  ineffective: (option: T) => boolean
  reason?: (option: T) => string
}) {
  return options.map(([option, label]) => (
    <Chip
      key={label}
      label={label}
      checked={value === option}
      onChange={(checked) => onChange(checked ? option : undefined)}
      ineffectiveReason={
        ineffective(option) ? (reason?.(option) ?? 'The current matchup resolves the same with or without this choice.') : undefined
      }
    />
  ))
}

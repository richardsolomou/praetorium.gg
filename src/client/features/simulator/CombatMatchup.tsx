import { invalidWeaponChoices } from './combatPreferences'
import { calculateCombatPair, combatCalculator } from './combatCalculation'
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
  diceExpression,
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
import {
  combatMatchup,
  noExclusions,
  strongestWeaponPreferences,
  type CombatAnswer,
  type CombatantSnapshot,
  type CombatRequest,
} from '../../../core/combatMatchup'
import {
  combineWeaponAdjustments,
  type CombatAdjustments,
  type TargetAdjustment,
  type WeaponAdjustment,
} from '../../../core/combatAdjustments'
import { adjustedCharacteristic } from '../../../core/combatRules'
import { datasheetCharacteristicKindOf } from '../../../core/datasheetStructure'
import { wargearKey } from '../../../core/wargear'
import { Chip, Choice, NoEffect, PHASE_TITLES, PhaseIcon } from './CombatControls'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CombatResults } from './CombatResults'
import { LoadoutOddsContext, LoadoutOptimizationContext, type LoadoutOptimization } from './LoadoutOdds'
import { useLoadoutOdds } from './useLoadoutOdds'
import type { MatchupSettings } from '../../../contracts/simulatorState'
import type { LoadoutSpace } from '../../../core/combatLoadouts'
import { groupBy } from '../../../core/collections'
import { Problem } from '../../components/Problem'
import { formatList, signedLabel } from '../../text'
import { useStableValue } from '../../useStableValue'
import { Stepper } from '../../components/Stepper'
import { useClientValue } from '../../useClientValue'
import { calculationInputs } from './calculationInputs'

function weaponToggleGroups(entries: readonly { profile: Datasheet['profiles'][number]; count: number }[]) {
  return [
    ...groupBy(
      entries.map(({ profile, count }) => ({ ...profile, count })),
      (profile) => wargearKey(profile.name, true),
    ),
  ]
}

const SHOOTING_PENALTY = '−1 to hit from this shooting type'

/** The profile with the hit roll its shooting type leaves it needing, so the card reads what the calculation uses. */
export function withPenalisedHitRoll(profile: Datasheet['profiles'][number], { needed, moved }: { needed: number; moved: boolean }) {
  return {
    ...profile,
    values: profile.values.map((value) => {
      const printed = Number.parseInt(value.value)
      if (datasheetCharacteristicKindOf(value) !== 'ballistic-skill' || needed === printed) return value
      return {
        ...value,
        value: `${needed}+`,
        baseValue: value.baseValue ?? value.value,
        modifiers: [
          ...(value.modifiers ?? []),
          ...(moved ? [SHOOTING_PENALTY] : []),
          ...(needed === printed + Number(moved) ? [] : ['other modifiers']),
        ],
      }
    }),
  }
}

const MANUAL_MODIFIERS = 'Manual modifiers'
let roomyAtLoad: boolean | undefined
// Read once a page load, so turning a tablet or resizing a window never closes a section someone is using.
const roomy = () => (roomyAtLoad ??= window.matchMedia('(min-width: 768px)').matches)

/** The profile with the manual stat modifiers on it, so the card reads what the calculation uses. */
export function withManualModifiers(profile: Datasheet['profiles'][number], adjustment: WeaponAdjustment) {
  // Skill and AP modifiers improve the roll, which lowers the printed number.
  const added: Partial<Record<ReturnType<typeof datasheetCharacteristicKindOf>, number>> = {
    'ballistic-skill': -(adjustment.skill ?? 0),
    'weapon-skill': -(adjustment.skill ?? 0),
    strength: adjustment.strength ?? 0,
    attacks: adjustment.attacks ?? 0,
    'armour-penetration': -(adjustment.ap ?? 0),
    damage: adjustment.damage ?? 0,
  }
  return {
    ...profile,
    values: profile.values.map((value) => {
      const add = added[datasheetCharacteristicKindOf(value)]
      // Like the calculation, a dice value loses at most its bonus.
      const bonus = diceExpression(value.value)?.bonus
      const applied = add && bonus !== undefined && /d/i.test(value.value) ? Math.max(add, -bonus) : add
      const adjusted = applied ? adjustedCharacteristic(value, applied, [MANUAL_MODIFIERS]) : value
      // A modifier the roll's limits swallow leaves the card as printed.
      return adjusted.value === value.value ? value : adjusted
    }),
  }
}

type PhaseScope = CombatPhase | 'all'
type AdjustmentSource = 'attack' | 'weapon' | 'target' | 'feelNoPain'
type CombatEntryPoint = 'standalone' | 'roster' | 'battle'

/** `refused` is whether the combined estimate's error is the matchup's own refusal rather than a failed calculation. */
export function combatOutcomeEvent(answer: CombatAnswer, source: CombatEntryPoint, refused = false) {
  const shooting = Boolean(answer.ranged?.result)
  const melee = Boolean(answer.melee?.result)
  const combined = !answer.combined ? 'none' : answer.combined.result ? 'calculated' : refused ? 'refused' : 'failed'
  if (shooting || melee) return { name: 'combat_simulation_completed', properties: { source, shooting, melee, combined } } as const
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
const commandRerolls = [
  ['hit', 'Hit roll'],
  ['wound', 'Wound roll'],
  ['save', 'Save roll'],
  ['attacks', 'Attacks roll'],
  ['damage', 'Damage roll'],
] as const
const commandRerollLabels = Object.fromEntries(commandRerolls)
/** The same settings with no Command Re-roll, so the results can show what spending it changes. */
const withoutCommandReroll = (settings: CombatAdjustments): CombatAdjustments => ({
  ...settings,
  ...Object.fromEntries(
    (['all', 'ranged', 'melee'] as const).flatMap((scope) =>
      settings[scope] ? [[scope, { ...settings[scope], commandReroll: undefined }]] : [],
    ),
  ),
})
const grants = [
  ['lethal', 'Lethal Hits'],
  ['devastating', 'Devastating Wounds'],
  ['damageReroll', 'Re-roll damage 1s'],
] as const
/** Modifiers from −`reach` to +`reach`, with the unit's own value in the middle. */
const signedSteps = (reach: number) =>
  Array.from({ length: reach * 2 + 1 }, (_, index) => index - reach).map(
    (value) => [value || undefined, value ? signedLabel(value) : '0'] as const,
  )
/** Roll thresholds from worst to best; a phase can also put back the 6+ that All improved. */
const rollSteps = (rolls: readonly number[], restoreSix: boolean) => [
  ...(restoreSix ? ([[6, '6+']] as const) : []),
  [undefined, '—'] as const,
  ...rolls.map((roll) => [roll, `${roll}+`] as const),
]
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
  // Both control sections start open where there is room; a phone starts on the results.
  const startOpen = useClientValue(roomy, false)
  const [buffsOpen, setBuffsOpen] = useState<boolean | null>(null)
  const [modifiersOpen, setModifiersOpen] = useState<boolean | null>(Object.keys(initialSettings?.adjustments ?? {}).length ? true : null)
  const [excludedWeapons, setExcludedWeapons] = useState<Record<CombatPhase, string[]>>(initialSettings?.excluded ?? noExclusions())
  const [outcome, setOutcome] = useState<{ key: string; attempt: number; answer: CombatAnswer; without?: CombatAnswer } | null>(null)
  const [retry, setRetry] = useState(0)
  const [invalidatedChoice, setInvalidatedChoice] = useState(false)
  const reported = useRef(false)
  const completed = useEffectEvent(() => onCompleted?.())
  const failureReported = useRef(false)
  const [allocation, setAllocation] = useState<readonly string[]>(initialSettings?.allocation ?? [])
  useEffect(() => {
    onSettingsChange?.({ adjustments, preferences, excluded: excludedWeapons, allocation: [...allocation] })
  }, [adjustments, preferences, excludedWeapons, allocation, onSettingsChange])
  // Weapon choices the player left open take the option that does most against this defender; only their own picks are saved.
  const [strongest, setStrongest] = useState<{ key: string; preferences: Record<string, string> } | null>(null)
  const strongestKey = useMemo(
    () => JSON.stringify([attacker, defender, preferences, excludedWeapons, allocation, adjustments, retry]),
    [attacker, defender, preferences, excludedWeapons, allocation, adjustments, retry],
  )
  const choosing = !pending && !failed && Boolean(attacker && defender) && strongest?.key !== strongestKey
  useEffect(() => {
    if (pending || failed || !attacker || !defender) return
    const controller = new AbortController()
    const calculator = combatCalculator()
    const settle = (found: Record<string, string>) => {
      if (!controller.signal.aborted) setStrongest({ key: strongestKey, preferences: found })
    }
    void strongestWeaponPreferences(attacker, defender, { preferences, excluded: excludedWeapons, allocation }, adjustments, (requests) =>
      calculator.calculate(requests, controller.signal),
    )
      .then(settle, () => settle(preferences))
      .finally(() => calculator.dispose())
    return () => controller.abort()
    // strongestKey stands for every input the search reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strongestKey, pending, failed])
  const chosen = strongest?.key === strongestKey ? strongest.preferences : preferences
  const matchup = useMemo(
    () => combatMatchup(attacker, defender, { preferences: chosen, excluded: excludedWeapons, allocation }),
    [attacker, defender, chosen, excludedWeapons, allocation],
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
  const scenarios = useMemo<CombatRequest>(() => matchup.request(adjustments), [matchup, adjustments])
  const commandRerolled = Boolean(adjustments.all?.commandReroll || adjustments.ranged?.commandReroll || adjustments.melee?.commandReroll)
  const scenariosWithout = useMemo<CombatRequest | null>(() => {
    if (!commandRerolled) return null
    return matchup.request(withoutCommandReroll(adjustments))
  }, [commandRerolled, matchup, adjustments])
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
  const requestKey = JSON.stringify(scenarios)
  const comparisonKey = JSON.stringify(scenariosWithout)
  const canSimulate = Boolean(scenarios.ranged || scenarios.melee)
  const outcomeKey = `${requestKey}\n${comparisonKey}`
  const updating = pending || choosing || (canSimulate && (outcome?.key !== outcomeKey || outcome?.attempt !== retry))
  useEffect(() => {
    if (pending || failed || choosing) return
    const request = JSON.parse(requestKey) as CombatRequest
    const comparison = JSON.parse(comparisonKey) as CombatRequest | null
    if (!request.ranged && !request.melee) return
    const controller = new AbortController()
    const key = `${requestKey}\n${comparisonKey}`
    void Promise.all([calculateCombatPair(request, controller.signal), comparison && calculateCombatPair(comparison, controller.signal)])
      .then(([answer, without]) => {
        if (controller.signal.aborted) return
        setOutcome({ key, attempt: retry, answer, ...(without ? { without } : {}) })
        const telemetry = combatOutcomeEvent(answer, entryPoint, Boolean(request.sequenceError))
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
          key,
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
  }, [requestKey, comparisonKey, pending, failed, choosing, retry, entryPoint])
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
            preferences: chosen,
            excluded: excludedWeapons,
            phases: { ranged: matchup.phaseSetup('ranged', adjustments), melee: matchup.phaseSetup('melee', adjustments) },
            afterLosses: matchup.afterLosses.map(({ units, matchup: after }) => ({
              units,
              opponent: { keywords: combatUnitKeywords(defender), rules: after.defenceRules },
              phases: { ranged: after.phaseSetup('ranged', adjustments), melee: after.phaseSetup('melee', adjustments) },
            })),
          }
        : null,
    [attacker, defender, pending, failed, attackRules, sequenceError, defenceRules, chosen, excludedWeapons, matchup, adjustments],
  )
  const loadoutOdds = useLoadoutOdds({
    space: loadoutSpace,
    scoring: loadoutScoring,
    expected: scenarios,
  })
  const optimizationKey = JSON.stringify({
    key: JSON.stringify([defender, adjustments, defenceRules, attacker?.models]),
    preferences: chosen,
    excluded: excludedWeapons,
    results:
      outcome?.key === outcomeKey
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
      <div className="@container min-w-0 space-y-3" aria-label="Combat matchup">
        <div className="grid gap-3 @xl:grid-cols-2">
          <section data-onboarding="simulator-attacker" aria-label="Attacker" className="min-w-0 part">
            <LoadoutOddsContext.Provider value={loadoutOdds}>
              <LoadoutOptimizationContext.Provider value={optimizationContext}>{attackerControl}</LoadoutOptimizationContext.Provider>
            </LoadoutOddsContext.Provider>
            <CombatDefences unit={attacker} />
          </section>
          <section data-onboarding="simulator-defender" aria-label="Defender" className="min-w-0 part">
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

        <div className="part p-3 sm:p-4">
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
              const statAdjustment = combineWeaponAdjustments(adjustments.weapons?.all ?? {}, adjustments.weapons?.[phase] ?? {})
              const hitRolls = matchup.hitRolls(phase, adjustments)
              const penalisedRoll = (id: string) => {
                const roll = hitRolls.get(id)
                const penalised = plan?.used.some(({ profile, weapon }) => profile.id === id && (weapon?.hitModifier ?? 0) < 0)
                return penalised && roll?.needed ? { needed: roll.needed, moved: roll.needed !== roll.withoutPenalty } : null
              }
              const answer = outcome?.answer[phase]
              const valid = Boolean(scenario(phase))
              const error = outcome?.key === outcomeKey ? answer?.error : undefined
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
                          <div
                            key={group[0]!.id}
                            data-weapon-card
                            className="relative min-w-0 rounded-lg border border-edge bg-sunken [&_h3]:pr-10"
                          >
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
                              <WeaponProfiles
                                weapons={group.map((profile) => {
                                  const roll = penalisedRoll(profile.id)
                                  const adjusted = withManualModifiers(profile, statAdjustment)
                                  return roll ? withPenalisedHitRoll(adjusted, roll) : adjusted
                                })}
                                rules={attacker?.sheet.keywordRules ?? []}
                                embedded
                              />
                              {group.some((profile) => penalisedRoll(profile.id)?.moved) ? (
                                <p className="px-3 pb-2 text-xs text-dim">{SHOOTING_PENALTY}</p>
                              ) : null}
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
          <details
            data-combat-buffs
            className="mt-3 border-t border-edge"
            open={buffsOpen ?? startOpen}
            onToggle={(event) => event.currentTarget.open !== (buffsOpen ?? startOpen) && setBuffsOpen(event.currentTarget.open)}
          >
            <summary className="rubric scroll-mt-header cursor-pointer py-3 text-info outline-none focus-visible:ring-2 focus-visible:ring-primary">
              Rules & buffs
            </summary>
            <div className="grid gap-4 pb-3 @xl:grid-cols-2">
              {attackerBuffs}
              {defenderBuffs}
            </div>
          </details>
          <section aria-label="Modifiers" className="border-t border-edge">
            <details
              data-manual-modifiers
              open={modifiersOpen ?? startOpen}
              onToggle={(event) => event.currentTarget.open !== (modifiersOpen ?? startOpen) && setModifiersOpen(event.currentTarget.open)}
            >
              <summary className="rubric scroll-mt-header cursor-pointer py-3 text-info outline-none focus-visible:ring-2 focus-visible:ring-primary">
                Manual modifiers
              </summary>
              <div className="pb-3">
                <Tabs defaultValue={(['all', ...COMBAT_PHASES] as const).find(activeCount) ?? 'all'} className="flex-col gap-3">
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
                          {(
                            [
                              ['hitModifier', 'Hit', 'hit roll'],
                              ['woundModifier', 'Wound', 'wound roll'],
                            ] as const
                          ).map(([field, name, label]) => (
                            <StepModifier
                              key={field}
                              name={name}
                              label={label}
                              options={signedSteps(1)}
                              value={adjustments[scope]?.[field]}
                              onChange={(value) => change(scope, field, value)}
                              reason={noEffect(scope, 'attack', field, adjustments[scope]?.[field])}
                            />
                          ))}
                          <StepModifier
                            name="Crit hit"
                            label="critical hit roll"
                            options={rollSteps([5, 4], scope !== 'all' && Boolean(adjustments.weapons?.all?.criticalHit))}
                            value={weapon.criticalHit}
                            onChange={set('criticalHit')}
                            reason={noEffect(scope, 'weapon', 'criticalHit', weapon.criticalHit)}
                          />
                          <StepModifier
                            name="Crit wound"
                            label="critical wound roll"
                            options={rollSteps([5, 4, 3, 2], scope !== 'all' && Boolean(adjustments.weapons?.all?.criticalWound))}
                            value={weapon.criticalWound}
                            onChange={set('criticalWound')}
                            reason={noEffect(scope, 'weapon', 'criticalWound', weapon.criticalWound)}
                          />
                        </ChipRow>
                        <ChipRow label="Re-rolls">
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
                        </ChipRow>
                        <ChipRow label="Command Re-roll">
                          <ChipFamily
                            value={adjustments[scope]?.commandReroll}
                            options={commandRerolls}
                            onChange={(value) => change(scope, 'commandReroll', value)}
                            ineffective={(option) => !modifierChoiceHasEffect(scope, 'attack', 'commandReroll', option)}
                          />
                        </ChipRow>
                        <ChipRow label="Stats">
                          {(
                            [
                              ['attacks', 'A', 'Attacks'],
                              ['skill', skill, scope === 'ranged' ? 'Ballistic Skill' : scope === 'melee' ? 'Weapon Skill' : 'BS/WS'],
                              ['strength', 'S', 'Strength'],
                              ['ap', 'AP', 'AP'],
                              ['damage', 'D', 'Damage'],
                            ] as const
                          ).map(([field, name, label]) => (
                            <StepModifier
                              key={field}
                              name={name}
                              label={label}
                              options={signedSteps(6)}
                              value={weapon[field]}
                              onChange={set(field)}
                              reason={noEffect(scope, 'weapon', field, weapon[field])}
                            />
                          ))}
                        </ChipRow>
                        <ChipRow label="Abilities">
                          <StepModifier
                            name="Sustained"
                            label="Sustained Hits"
                            options={[
                              ...(scope !== 'all' && adjustments.weapons?.all?.sustained ? ([['0', 'Off']] as const) : []),
                              [undefined, '—'],
                              ...Object.keys(sustainedAmounts).map((key) => [key, key] as const),
                            ]}
                            value={sustainedKey(weapon.sustained)}
                            onChange={(value) =>
                              changeWeapon(
                                scope,
                                'sustained',
                                value === undefined ? undefined : value === '0' ? 0 : sustainedAmounts[value],
                              )
                            }
                            reason={noEffect(scope, 'weapon', 'sustained', weapon.sustained)}
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
                    {(
                      [
                        ['toughness', 'T', 'Toughness'],
                        ['save', 'Sv', 'Save'],
                      ] as const
                    ).map(([field, name, label]) => (
                      <StepModifier
                        key={field}
                        name={name}
                        label={label}
                        options={signedSteps(6)}
                        value={adjustments.target?.[field]}
                        onChange={(value) => changeTarget(field, value)}
                        reason={noEffect('all', 'target', field, adjustments.target?.[field])}
                      />
                    ))}
                  </ChipRow>
                  <ChipRow label="Protection">
                    <StepModifier
                      name="Invuln"
                      label="invulnerable save"
                      options={[[undefined, '—'], ...[6, 5, 4, 3].map((roll) => [roll, `${roll}++`] as const)]}
                      value={adjustments.target?.invulnerable ?? undefined}
                      onChange={(value) => changeTarget('invulnerable', value)}
                      reason={noEffect('all', 'target', 'invulnerable', adjustments.target?.invulnerable ?? undefined)}
                    />
                    <StepModifier
                      name="FNP"
                      label="Feel No Pain"
                      options={[[undefined, '—'], ...[6, 5, 4, 3, 2].map((roll) => [roll, `${roll}+`] as const)]}
                      value={extraFeelNoPain ?? undefined}
                      onChange={(value) => setAdjustments((current) => ({ ...current, feelNoPain: value ?? null }))}
                      reason={noEffect('all', 'feelNoPain', 'feelNoPain', extraFeelNoPain ?? undefined)}
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
        {outcome?.key === outcomeKey && outcome.answer.combined?.error ? (
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
        without={
          outcome?.without && commandRerolled
            ? {
                ranged: outcome.without.ranged?.result,
                melee: outcome.without.melee?.result,
                combined: outcome.without.combined?.result,
              }
            : undefined
        }
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
      <div className="px-3 pb-3 sm:px-4 sm:pb-4 [&_[data-characteristic]]:rounded-none [&_[data-characteristic]]:border-0 [&_[data-characteristic]]:bg-transparent [&_[data-characteristic]]:shadow-none [&_[data-characteristic]>p:last-child]:text-xl [&_[data-characteristic]>p:last-child]:font-semibold [&_[data-slot=profile-grid]]:gap-0 [&_[data-slot=profile-grid]]:divide-x [&_[data-slot=profile-grid]]:divide-edge [&_[data-slot=profile-grid]]:rounded-lg [&_[data-slot=profile-grid]]:border [&_[data-slot=profile-grid]]:border-edge [&_[data-slot=profile-grid]]:bg-sunken">
        <ProfileGrid values={values(groups[0])} columns={5} />
      </div>
    )
  return (
    <div className="px-3 pb-3 sm:px-4 sm:pb-4">
      <table className="w-full table-fixed rounded-lg border border-edge bg-sunken text-center">
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

/** One ordered choice, stepped or picked directly; its name puts back the unit's own value. */
function StepModifier<T>({
  name,
  label,
  options,
  value,
  onChange,
  reason,
}: {
  name: string
  label: string
  /** Worst to best, including `undefined` for the unit's own value. */
  options: readonly (readonly [T | undefined, string])[]
  value: T | undefined
  onChange: (value: T | undefined) => void
  /** Why the chosen value changes nothing here. */
  reason?: string
}) {
  const neutral = options.findIndex(([option]) => option === undefined)
  const found = options.findIndex(([option]) => option === value)
  const index = found < 0 ? neutral : found
  const set = (next: number) => onChange(options[next]![0])
  const changed = index !== neutral
  return (
    <span
      data-step={label}
      className={`inline-flex h-8 items-center gap-1.5 rounded-md border pr-1 ${changed ? 'border-primary/60 bg-primary/10' : 'border-edge'} ${reason ? 'border-dashed' : ''}`}
    >
      {/* The explanation hangs off the name alone, so it never covers the list of values. */}
      <NoEffect reason={reason}>
        <button
          type="button"
          aria-label={`Reset ${label}`}
          disabled={!changed}
          onClick={() => set(neutral)}
          className={`h-full rounded-l-md pr-0.5 pl-2.5 text-sm font-semibold whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-primary ${changed ? 'text-primary hover:text-bone' : 'text-dim'}`}
        >
          {name}
        </button>
      </NoEffect>
      <Stepper
        label={label}
        count={index}
        countLabel={`${label} modifier`}
        format={(at) => options[at]![1]}
        onAdd={index < options.length - 1 ? () => set(index + 1) : undefined}
        onRemove={index > 0 ? () => set(index - 1) : undefined}
        choices={options.map((_, at) => at)}
        onChoose={set}
      />
    </span>
  )
}

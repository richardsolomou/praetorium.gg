import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { posthog } from 'posthog-js'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { ArrowUp, Crosshair, RotateCcw, Swords } from 'lucide-react'
import { ProfileGrid, WeaponProfiles } from '../../components/DatasheetProfiles'
import type { Datasheet } from '../../../contracts/catalogue'
import {
  DEFAULT_COMBAT_OPTIONS,
  criticalThresholdMatters,
  halfRangeMatters,
  rerollAdjustmentMatters,
  rerollRank,
  rollAdjustmentMatters,
  saveAdjustmentMatters,
  type CombatInput,
  type CombatTargetGroup,
  type CombatOptions,
  type CombatResult,
} from '../../../core/combat'
import type { CombatCarrier } from '../../../core/combatLoadout'
import { combatTarget } from '../../../core/combatProfiles'
import { combatAttackInput, combatAttacks, combatWeaponInputs } from '../../../core/combatScenario'
import {
  adjustCombatTarget,
  combineAttackAdjustments,
  combineWeaponAdjustments,
  type CombatAdjustments,
  type TargetAdjustment,
  type WeaponAdjustment,
} from '../../../core/combatAdjustments'
import { wargearKey } from '../../../core/wargear'
import { combatRuleDefences, combatRuleOptions, type ActiveCombatRule } from '../../../core/combatRules'
import { CombatRuleLabel } from './CombatRuleLabel'
import { Chip, Choice } from './CombatControls'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CombatEstimate } from './CombatEstimate'
import { LoadoutHint, LoadoutsContext } from './LoadoutSuggestions'
import { WeaponOdds } from './WeaponOdds'
import { useLoadoutSearch, type CheckLoadouts, type LoadoutContext } from './loadoutSearch'
import type { MatchupSettings } from './simulatorUrl'
import type { LoadoutSpace } from '../../../core/combatLoadouts'
import type { RosterPick } from '../../../core/roster'

function weaponToggleGroups(entries: readonly { profile: Datasheet['profiles'][number]; count: number }[]) {
  const groups = new Map<string, Datasheet['profiles']>()
  for (const { profile, count } of entries) {
    const key = wargearKey(profile.name, true)
    groups.set(key, [...(groups.get(key) ?? []), { ...profile, count }])
  }
  return [...groups]
}

export type CombatantSnapshot = {
  sheet: Datasheet
  models: number
  startingModels?: number
  carriers: readonly CombatCarrier[]
  rules?: readonly ActiveCombatRule[]
  damage?: number
  allocationRequired?: boolean
}
type Phase = CombatOptions['phase']
type Scope = Phase | 'all'
export type CombatRequest = Record<Phase, CombatInput | null>
/** Each weapon profile alone, so a card can show what it contributes and what its other modes would. */
export type CombatWeaponRequest = Record<Phase, { id: string; input: CombatInput }[]>
export type CombatAnswer = Record<Phase, { result?: CombatResult; error?: string } | null> & {
  weapons?: Record<Phase, Record<string, CombatResult>>
}
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
const signedOptions = (values: readonly number[], name: string) =>
  values.map((value) => [value, `${value > 0 ? '+' : '−'}${Math.abs(value)} ${name}`] as const)
const rollOptions = (values: readonly number[], prefix: string) => values.map((value) => [value, `${prefix}${value}+`] as const)
const situations = {
  ranged: [
    ['cover', 'Cover (−1 BS)'],
    ['halfRange', 'Half range'],
    ['heavy', 'Heavy'],
  ],
  melee: [['charged', 'Charged']],
} as const
const phases = [
  ['ranged', 'Shooting'],
  ['melee', 'Melee'],
] as const

/** The same matchup surface accepts catalogue picks or already evaluated roster/battle units. */
export function CombatMatchup({
  entryPoint = 'standalone',
  attacker,
  defender,
  pending = false,
  failed = false,
  attackerControl,
  defenderControl,
  buffs,
  inDialog = false,
  loadouts,
  initialSettings,
  onSettingsChange,
}: {
  entryPoint?: CombatEntryPoint
  attacker: CombatantSnapshot | null
  defender: CombatantSnapshot | null
  pending?: boolean
  failed?: boolean
  attackerControl?: ReactNode
  defenderControl?: ReactNode
  buffs?: ReactNode
  inDialog?: boolean
  /** Choices restored from a shared link, and where to report them as they change. */
  initialSettings?: MatchupSettings
  onSettingsChange?: (settings: MatchupSettings) => void
  /** The attacker's weapon choices, offered when its loadout can change in this matchup. */
  loadouts?: {
    context: LoadoutContext
    space: LoadoutSpace | null | undefined
    check: CheckLoadouts
    onUse: (pick: RosterPick) => void
    onOpen: () => void
  }
}) {
  const [adjustments, setAdjustments] = useState<CombatAdjustments>(initialSettings?.adjustments ?? {})
  const [preferences, setPreferences] = useState<Record<string, string>>(initialSettings?.preferences ?? {})
  const [excludedWeapons, setExcludedWeapons] = useState<Record<Phase, string[]>>(initialSettings?.excluded ?? { ranged: [], melee: [] })
  const [outcome, setOutcome] = useState<{ key: string; attempt: number; answer: CombatAnswer } | null>(null)
  const [retry, setRetry] = useState(0)
  const reported = useRef(false)
  const failureReported = useRef(false)
  const [allocation, setAllocation] = useState<readonly string[]>(initialSettings?.allocation ?? [])
  useEffect(() => {
    onSettingsChange?.({ adjustments, preferences, excluded: excludedWeapons, allocation: [...allocation] })
  }, [adjustments, preferences, excludedWeapons, allocation, onSettingsChange])
  const built = defender ? combatTarget(defender.sheet, defender.models, defender.startingModels, defender.carriers) : null
  const position = (label: string) => (allocation.includes(label) ? allocation.indexOf(label) : allocation.length)
  const order = (built?.labels ?? []).map((_, index) => index).toSorted((a, b) => position(built!.labels[a]!) - position(built!.labels[b]!))
  const labels = order.map((index) => built!.labels[index]!)
  const target =
    built?.target && defender
      ? {
          ...built,
          labels,
          target: { ...built.target, groups: order.map((index) => built.target!.groups[index]!), damage: defender.damage ?? 0 },
        }
      : built
  const allocateEarlier = (index: number) =>
    setAllocation(labels.map((label, at) => (at === index - 1 ? labels[index]! : at === index ? labels[index - 1]! : label)))
  const attackRules = attacker?.rules ?? []
  const defenceRules = defender?.rules ?? []
  const ruleDefences = {
    ranged: target?.target ? combatRuleDefences(target.target, defenceRules, 'ranged', attackRules) : null,
    melee: target?.target ? combatRuleDefences(target.target, defenceRules, 'melee', attackRules) : null,
  }
  const defencesIn = (phase: Phase, settings: CombatAdjustments = adjustments) =>
    ruleDefences[phase] ? adjustCombatTarget(ruleDefences[phase], settings.target ?? {}) : null
  const rangedDefences = defencesIn('ranged')
  const meleeDefences = defencesIn('melee')
  const extraFeelNoPain = adjustments.feelNoPain ?? null
  const betterFeelNoPain = (printed: number | null | undefined) =>
    extraFeelNoPain && (!printed || extraFeelNoPain < printed) ? extraFeelNoPain : (printed ?? null)
  const withExtraFeelNoPain = (defences: CombatInput['target'], settings: CombatAdjustments = adjustments) => {
    const extra = settings.feelNoPain ?? null
    return { ...defences, feelNoPain: extra && (!defences.feelNoPain || extra < defences.feelNoPain) ? extra : defences.feelNoPain }
  }
  const feelNoPain = betterFeelNoPain(
    rangedDefences?.feelNoPain === meleeDefences?.feelNoPain ? rangedDefences?.feelNoPain : target?.target?.feelNoPain,
  )
  const attackOptions = {
    ranged: combatRuleOptions(attackRules, 'attacker', 'ranged'),
    melee: combatRuleOptions(attackRules, 'attacker', 'melee'),
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
  const options = (phase: Phase, settings: CombatAdjustments = adjustments): CombatOptions => {
    const attack = attackOptions[phase]
    const defence = defenceOptions[phase]
    const base = inheritedOptions(phase)
    const shared = settings.all ?? {}
    const specific = settings[phase] ?? {}
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
    ? combatAttacks(attacker, { keywords: defender?.sheet.keywords ?? [], rules: defenceRules }, preferences, excludedWeapons)
    : null
  const plans = { ranged: attacks?.ranged.plan ?? null, melee: attacks?.melee.plan ?? null }
  const scenario = (phase: Phase, settings: CombatAdjustments = adjustments): CombatInput | null => {
    const defences = defencesIn(phase, settings)
    return attacks && !attacker?.allocationRequired
      ? combatAttackInput(
          attacks[phase],
          defences && withExtraFeelNoPain(defences, settings),
          options(phase, settings),
          combineWeaponAdjustments(settings.weapons?.all ?? {}, settings.weapons?.[phase] ?? {}),
        )
      : null
  }
  const scenarios: CombatRequest = { ranged: scenario('ranged'), melee: scenario('melee') }
  const phaseSetup = (phase: Phase) => {
    const defences = defencesIn(phase)
    return defences
      ? {
          target: withExtraFeelNoPain(defences),
          options: options(phase),
          adjustment: combineWeaponAdjustments(adjustments.weapons?.all ?? {}, adjustments.weapons?.[phase] ?? {}),
        }
      : null
  }
  const modifierChoiceHasEffect = (
    scope: Scope,
    source: 'attack' | 'weapon' | 'target' | 'feelNoPain',
    field: string,
    candidate: unknown,
    onlyPhase?: Phase,
  ) => {
    const affected = onlyPhase
      ? [onlyPhase]
      : scope === 'all' || source === 'target' || source === 'feelNoPain'
        ? phases.map(([phase]) => phase)
        : [scope]
    if (!affected.some((phase) => scenarios[phase])) return true
    const currentValue =
      source === 'weapon'
        ? adjustments.weapons?.[scope]?.[field as keyof WeaponAdjustment]
        : source === 'target'
          ? adjustments.target?.[field as keyof TargetAdjustment]
          : source === 'feelNoPain'
            ? adjustments.feelNoPain
            : adjustments[scope]?.[field as keyof Omit<CombatOptions, 'phase'>]
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
  const modifierHasEffect = (scope: Scope, source: 'attack' | 'weapon' | 'target' | 'feelNoPain', field: string, onlyPhase?: Phase) => {
    const selected =
      source === 'weapon'
        ? adjustments.weapons?.[scope]?.[field as keyof WeaponAdjustment]
        : source === 'target'
          ? adjustments.target?.[field as keyof TargetAdjustment]
          : source === 'feelNoPain'
            ? adjustments.feelNoPain
            : adjustments[scope]?.[field as keyof Omit<CombatOptions, 'phase'>]
    return modifierChoiceHasEffect(scope, source, field, selected, onlyPhase)
  }
  const noEffectReason = (scope: Scope, source: 'attack' | 'weapon' | 'target' | 'feelNoPain', field: string, candidate?: unknown) => {
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
  const weaponInputs = Object.fromEntries(
    phases.map(([phase]) => {
      const setup = phaseSetup(phase)
      return [
        phase,
        attacker && defender && setup && !attacker.allocationRequired
          ? combatWeaponInputs(
              { sheet: attacker.sheet, carriers: attacker.carriers, models: attacker.models, rules: attackRules },
              { keywords: defender.sheet.keywords, rules: defenceRules },
              phase,
              setup.target,
              setup.options,
              setup.adjustment,
            )
          : [],
      ]
    }),
  ) as Record<Phase, ReturnType<typeof combatWeaponInputs>>
  const weaponRequest: CombatWeaponRequest = {
    ranged: weaponInputs.ranged.map(({ profile, input }) => ({ id: profile.id, input })),
    melee: weaponInputs.melee.map(({ profile, input }) => ({ id: profile.id, input })),
  }
  const weaponResult = (phase: Phase, id: string) => (outcome?.key === requestKey ? outcome.answer.weapons?.[phase][id] : undefined)
  const requestKey = JSON.stringify({ ...scenarios, weapons: weaponRequest })
  const canSimulate = Boolean(scenarios.ranged || scenarios.melee)
  const updating = pending || (canSimulate && (outcome?.key !== requestKey || outcome?.attempt !== retry))
  useEffect(() => {
    if (pending || failed) return
    const request = JSON.parse(requestKey) as CombatRequest & { weapons: CombatWeaponRequest }
    if (!request.ranged && !request.melee) return
    let active = true
    let worker: Worker | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    const stop = () => {
      active = false
      worker?.terminate()
      clearTimeout(timer)
    }
    const fail = (message: string, reason: 'worker_error' | 'timeout' | 'startup') => {
      if (!active) return
      setOutcome({
        key: requestKey,
        attempt: retry,
        answer: { ranged: request.ranged ? { error: message } : null, melee: request.melee ? { error: message } : null },
      })
      if (!failureReported.current) {
        failureReported.current = true
        posthog.capture('combat_simulation_failed', { source: entryPoint, reason })
      }
      stop()
    }
    try {
      worker = new Worker(new URL('./combat.worker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = (event: MessageEvent<CombatAnswer>) => {
        if (active) {
          setOutcome({ key: requestKey, attempt: retry, answer: event.data })
          const telemetry = combatOutcomeEvent(event.data, entryPoint)
          if (telemetry?.name === 'combat_simulation_completed' && !reported.current) {
            reported.current = true
            posthog.capture(telemetry.name, telemetry.properties)
          } else if (telemetry?.name === 'combat_simulation_failed' && !failureReported.current) {
            failureReported.current = true
            posthog.capture(telemetry.name, telemetry.properties)
          }
        }
        stop()
      }
      worker.onerror = () => fail('The calculation failed. Try again.', 'worker_error')
      timer = setTimeout(() => fail('The calculation took too long. Reduce the model count and try again.', 'timeout'), 15_000)
      worker.postMessage(request)
    } catch {
      fail('The calculation could not start. This browser must support Web Workers.', 'startup')
    }
    return stop
  }, [requestKey, pending, failed, retry, entryPoint])
  // After the estimate's effect, so the matchup's own calculation starts first.
  const found = useLoadoutSearch({
    context: loadouts?.context ?? null,
    space: loadouts?.space,
    check: loadouts?.check ?? null,
    scoring:
      attacker && defender && !attacker.allocationRequired && !pending && !failed
        ? {
            sheet: attacker.sheet,
            models: attacker.models,
            rules: attackRules,
            opponent: { keywords: defender.sheet.keywords, rules: defenceRules },
            preferences,
            excluded: excludedWeapons,
            phases: { ranged: phaseSetup('ranged'), melee: phaseSetup('melee') },
          }
        : null,
    expected: scenarios,
  })
  const defenderName = defender?.sheet.name
  const onUse = loadouts?.onUse
  const advice = useMemo(
    () => (found && defenderName && onUse ? { loadouts: found, defender: defenderName, onUse } : null),
    [found, defenderName, onUse],
  )
  const change = <K extends keyof CombatOptions>(scope: Scope, name: K, value: CombatOptions[K] | undefined) =>
    setAdjustments((current) => ({ ...current, [scope]: { ...current[scope], [name]: value } }))
  const changeWeapon = <K extends keyof WeaponAdjustment>(scope: Scope, name: K, value: WeaponAdjustment[K]) =>
    setAdjustments((current) => ({ ...current, weapons: { ...current.weapons, [scope]: { ...current.weapons?.[scope], [name]: value } } }))
  const changeTarget = <K extends keyof TargetAdjustment>(name: K, value: TargetAdjustment[K]) =>
    setAdjustments((current) => ({ ...current, target: { ...current.target, [name]: value } }))
  const weaponAdjustment = (scope: Scope) => adjustments.weapons?.[scope] ?? {}
  const activeCount = (scope: Scope) =>
    [...Object.values(adjustments[scope] ?? {}), ...Object.values(weaponAdjustment(scope))].filter(
      (value) => value !== undefined && value !== 'direct',
    ).length
  const phaseSummary = (phase: Phase) => {
    const applied: string[] = []
    const add = (scope: Scope, source: 'attack' | 'weapon' | 'target' | 'feelNoPain', field: string, label: string, value: unknown) => {
      if (value === undefined || value === null) return
      if (modifierHasEffect(scope, source, field, phase)) applied.push(label)
    }
    const sourceOptions = inheritedOptions(phase)
    const resolved = options(phase)
    if (sourceOptions.hitReroll !== 'none' && resolved.hitReroll === sourceOptions.hitReroll)
      applied.push(`${sourceOptions.hitReroll === 'ones' ? 'Re-roll hit 1s' : 'Re-roll hits'} from rules`)
    if (sourceOptions.woundReroll !== 'none' && resolved.woundReroll === sourceOptions.woundReroll)
      applied.push(`${sourceOptions.woundReroll === 'ones' ? 'Re-roll wound 1s' : 'Re-roll wounds'} from rules`)
    for (const scope of ['all', phase] as const) {
      const name = scope === 'all' ? 'All' : phase === 'ranged' ? 'Shooting' : 'Melee'
      const attack = adjustments[scope] ?? {}
      const weapon = weaponAdjustment(scope)
      for (const [field, label] of [
        ['hitModifier', 'to hit'],
        ['woundModifier', 'to wound'],
      ] as const) {
        const value = attack[field]
        if (value) applied.push(`${value > 0 ? '+' : '−'}${Math.abs(value)} ${label} (${name})`)
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
        if (value) add(scope, 'weapon', field, `${value > 0 ? '+' : '−'}${Math.abs(value)} ${label} (${name})`, value)
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
      if (value) add('all', 'target', field, `${value > 0 ? '+' : '−'}${Math.abs(value)} defender ${label}`, value)
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
      if (Math.abs(modifier) > 1) applied.push(`${roll} roll modifier capped at ${modifier > 0 ? '+1' : '−1'}`)
    return applied
  }
  const sources = [
    ...new Set(
      [attacker, defender].flatMap(
        (unit) => unit?.sheet.profiles.flatMap((profile) => profile.values.flatMap((value) => value.modifiers ?? [])) ?? [],
      ),
    ),
  ]
  return (
    <div className="@container min-w-0 border border-edge bg-panel" aria-label="Combat matchup">
      <div className="grid divide-y divide-edge @xl:grid-cols-2 @xl:divide-x @xl:divide-y-0">
        <section aria-label="Attacker" className="min-w-0">
          <LoadoutsContext.Provider value={advice}>
            {attackerControl ?? <CombatantHeading side="Attacker" unit={attacker} />}
          </LoadoutsContext.Provider>
          <CombatDefences unit={attacker} />
        </section>
        <section aria-label="Defender" className="min-w-0">
          {defenderControl ?? <CombatantHeading side="Defender" unit={defender} />}
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
        {attacker?.allocationRequired ? (
          <p role="alert" className="mb-3 text-sm text-discarded">
            Choose the attacker's surviving models and weapons to calculate attacks.
          </p>
        ) : null}
        {target?.error ? (
          <p role="alert" className="mb-3 text-sm text-discarded">
            {target.error}
          </p>
        ) : null}
        <div className="grid gap-3 @xl:grid-cols-2">
          {phases.map(([phase, title]) => {
            const plan = plans[phase]
            const answer = outcome?.answer[phase]
            const valid = Boolean(scenario(phase))
            const error = outcome?.key === requestKey ? answer?.error : undefined
            return (
              <section
                key={phase}
                aria-label={`${title} results`}
                aria-busy={valid && updating && !failed}
                className="min-w-0 rounded-md border border-edge bg-sunken p-3"
              >
                <h2 className="rubric flex items-center gap-2">
                  {phase === 'ranged' ? (
                    <Crosshair className="size-4 text-info" aria-hidden />
                  ) : (
                    <Swords className="size-4 text-info" aria-hidden />
                  )}
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
                  <div role="alert" className="mt-2 text-xs text-discarded">
                    {error}{' '}
                    <Button size="sm" variant="outline" onClick={() => setRetry((value) => value + 1)}>
                      Retry
                    </Button>
                  </div>
                ) : null}
                <div className="mt-3 space-y-3">
                  {plan?.choices.map((choice) => (
                    <Choice
                      key={choice.key}
                      label={choice.label}
                      value={choice.value}
                      choices={choice.options.map((option) => {
                        const result = weaponResult(phase, option.value)
                        return [
                          option.value,
                          result
                            ? `${option.label} · ${(result.wipe * 100).toFixed(1)}% · ${result.meanDamage.toFixed(2)} wounds`
                            : option.label,
                        ] as const
                      })}
                      onChange={(value) => setPreferences((current) => ({ ...current, [choice.key]: value }))}
                    />
                  ))}
                  <div className="space-y-1.5">
                    {weaponToggleGroups(plan?.used ?? []).map(([key, group]) => {
                      const included = !excludedWeapons[phase].includes(key)
                      return (
                        <div key={group[0]!.id} data-weapon-card className="relative min-w-0 [&_h3]:pr-10">
                          <Switch
                            className="absolute top-2 right-2 z-10 border-edge data-checked:border-primary data-checked:bg-primary data-unchecked:bg-zinc-600 [&_[data-slot=switch-thumb]]:bg-white"
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
                            <WeaponProfiles weapons={group} rules={attacker?.sheet.keywordRules ?? []} />
                            <WeaponOdds
                              muted={updating}
                              rows={weaponInputs[phase]
                                .filter(({ profile }) => wargearKey(profile.name) === key)
                                .map(({ profile }) => ({
                                  name: profile.name,
                                  result: weaponResult(phase, profile.id),
                                  inUse: group.some((used) => used.id === profile.id),
                                }))}
                            />
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
        {loadouts ? <LoadoutHint loadouts={found} onOpen={loadouts.onOpen} /> : null}
        {buffs ?? (
          <div className="mt-4 grid gap-4 @xl:grid-cols-2">
            {[
              { side: 'Attacker', unit: attacker },
              { side: 'Defender', unit: defender },
            ].map(({ side, unit }) => {
              if (!unit?.sheet.abilities.length) return null
              return (
                <section key={side} aria-label={`${side} rules`} className="min-w-0">
                  <h3 className="rubric">{side} rules</h3>
                  <div className="mt-3 space-y-3">
                    {unit.sheet.abilities.map((ability) => (
                      <div key={ability.id}>
                        <CombatRuleLabel
                          side={side}
                          name={ability.name}
                          description={ability.description}
                          rules={unit.sheet.keywordRules}
                        />
                      </div>
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        )}
        <section aria-label="Modifiers" className="mt-4 border-t border-edge pt-3">
          <Tabs defaultValue="ranged" className="flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="rubric">Modifiers</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setAdjustments({})
                  setPreferences({})
                  setExcludedWeapons({ ranged: [], melee: [] })
                }}
              >
                <RotateCcw aria-hidden />
                Reset
              </Button>
            </div>
            <TabsList aria-label="Attack modifiers" className="h-11! w-full border border-edge bg-raised p-1">
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
                        scope !== 'all' && adjustments.all?.hitReroll ? ([...hitRerolls, ['none', 'No hit re-roll']] as const) : hitRerolls
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
                      options={rollOptions(scope !== 'all' && adjustments.weapons?.all?.criticalHit ? [5, 4, 6] : [5, 4], 'Crit hits ')}
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
                        changeWeapon(scope, 'sustained', value === undefined ? undefined : value === '0' ? 0 : sustainedAmounts[value])
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
          {sources.length ? (
            <p className="mt-3 text-xs text-dim">Inherited: {sources.join(' · ')}. Evaluated profile changes are included.</p>
          ) : null}
          <section aria-label="Applied modifiers" className="mt-3 space-y-2 border-t border-edge pt-3 text-xs">
            <h3 className="rubric">Calculation uses</h3>
            {phases.map(([phase, title]) => {
              const applied = phaseSummary(phase)
              return (
                <p key={phase}>
                  <span className="font-semibold text-bone">{title}.</span>{' '}
                  <span className="text-dim">
                    {scenarios[phase] ? (applied.length ? applied.join(', ') : 'No extra modifiers') : 'No attack calculated'}.
                  </span>
                </p>
              )
            })}
          </section>
        </section>
      </div>
      <div className="h-40 sm:h-32" aria-hidden />
      <div
        aria-label="Results summary"
        data-results-summary
        className={`fixed right-0 left-0 z-40 mx-auto grid gap-1 border border-edge bg-panel/95 p-1 shadow-lg backdrop-blur sm:grid-cols-2 sm:gap-2 sm:p-2 ${inDialog ? 'bottom-0 max-w-3xl' : 'bottom-16 w-[calc(100%-1.5rem)] max-w-[calc(64rem-2rem)] sm:w-[calc(100%-2rem)] min-[860px]:bottom-0'}`}
      >
        <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2 px-2 text-xs text-dim sm:hidden">
          <span />
          <div className="grid grid-cols-3 gap-1">
            <span>Wounds</span>
            <span>Models</span>
            <span>Destroyed</span>
          </div>
        </div>
        {phases.map(([phase, title]) => {
          const valid = Boolean(scenario(phase))
          const result = valid ? outcome?.answer[phase]?.result : undefined
          return (
            <section
              key={phase}
              aria-label={`${title} estimate`}
              aria-busy={valid && updating && !failed}
              className="grid min-w-0 grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-2 rounded-md border border-edge bg-sunken px-2 py-1.5 sm:block sm:px-3 sm:py-2"
            >
              <h2 className="rubric flex items-center gap-1 text-xs sm:gap-2 sm:text-base">
                {phase === 'ranged' ? (
                  <Crosshair className="size-3 shrink-0 text-info sm:size-4" aria-hidden />
                ) : (
                  <Swords className="size-3 shrink-0 text-info sm:size-4" aria-hidden />
                )}
                {title}
              </h2>
              <div data-result-numbers className="grid grid-cols-3 gap-1 sm:mt-2 sm:gap-2 sm:border-t sm:pt-2">
                {[
                  { label: 'Wounds lost', value: result?.meanDamage.toFixed(2), distribution: result?.damage },
                  { label: 'Models lost', value: result?.meanKills.toFixed(2), distribution: result?.kills },
                  { label: 'Unit destroyed', value: result ? `${(result.wipe * 100).toFixed(1)}%` : undefined },
                ].map(({ label, value, distribution }) => (
                  <div key={label} className="min-w-0">
                    <p className="hidden truncate text-xs text-dim sm:block">{label}</p>
                    {distribution && value ? (
                      <CombatEstimate label={`${title} · ${label}`} value={value} distribution={distribution} muted={updating || failed} />
                    ) : (
                      <p
                        className={`readout flex min-h-9 items-center text-sm sm:mt-1 sm:min-h-0 sm:text-xl ${updating || failed ? 'text-dim' : 'text-primary'}`}
                      >
                        {value ?? '—'}
                      </p>
                    )}
                    {label !== 'Unit destroyed' ? <p className="hidden text-xs text-faint sm:block">average</p> : null}
                  </div>
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

function CombatantHeading({ side, unit }: { side: string; unit: CombatantSnapshot | null }) {
  return (
    <div className="min-w-0 p-3 sm:p-4">
      <h2 className="rubric">{side}</h2>
      <p className="mt-2 text-sm">{unit?.sheet.name ?? 'Select a unit'}</p>
      {unit ? <p className="mt-1 text-xs text-dim">{unit.models} models</p> : null}
    </div>
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
  const printed = configured ?? (unit ? combatTarget(unit.sheet, unit.models, unit.startingModels, unit.carriers) : null)
  const target = printed?.target ?? null
  const fnp = feelNoPain === undefined ? target?.feelNoPain : feelNoPain
  const groups = target?.groups ?? []
  const values = (group: CombatTargetGroup | undefined) => [
    { name: 'T', value: group ? String(group.toughness) : '—' },
    { name: 'Sv', value: group ? `${group.save}+` : '—' },
    { name: 'W', value: group ? String(group.wounds) : '—' },
    { name: 'InSv', value: group?.invulnerable ? `${group.invulnerable}+` : '—' },
    { name: 'FNP', value: fnp ? `${fnp}+` : '—' },
  ]
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
                    {onAllocateEarlier && index > 0 ? (
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

/** Without a title the icon only decorates a heading that already names the phase. */
function PhaseIcon({ phase, title }: { phase: Phase; title?: string }) {
  const Icon = phase === 'ranged' ? Crosshair : Swords
  return <Icon className="size-3.5 shrink-0 text-info" aria-label={title} aria-hidden={title ? undefined : true} />
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

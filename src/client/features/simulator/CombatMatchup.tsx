import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { ArrowUp, Crosshair, RotateCcw, Swords } from 'lucide-react'
import { ProfileGrid, WeaponProfiles } from '../builder/DatasheetPanel'
import type { Datasheet } from '../../../contracts/catalogue'
import {
  DEFAULT_COMBAT_OPTIONS,
  type CombatInput,
  type CombatTargetGroup,
  type CombatOptions,
  type CombatResult,
} from '../../../core/combat'
import type { CombatCarrier } from '../../../core/combatLoadout'
import { combatPlan, combatTarget } from '../../../core/combatProfiles'
import { adjustCombatTarget, adjustCombatWeapon, type TargetAdjustment, type WeaponAdjustment } from '../../../core/combatAdjustments'
import {
  combatRuleDefences,
  combatRuleOptions,
  combatRuleProfiles,
  combatRuleWeapons,
  combatRuleMortals,
  type ActiveCombatRule,
} from '../../../core/combatRules'
import { CombatRuleLabel } from './CombatRuleLabel'
import { Chip, Choice, Segmented } from './CombatControls'
import { Stepper } from '../builder/LoadoutControls'
import { CombatEstimate } from './CombatEstimate'

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
/** Situational extras layered over the datasheet and its rules; each combines the way the game combines two sources. */
type CombatAdjustments = {
  ranged?: Partial<Omit<CombatOptions, 'phase'>>
  melee?: Partial<Omit<CombatOptions, 'phase'>>
  weapons?: Partial<Record<Phase, WeaponAdjustment>>
  target?: TargetAdjustment
  feelNoPain?: number | null
}
export type CombatRequest = Record<Phase, CombatInput | null>
export type CombatAnswer = Record<Phase, { result?: CombatResult; error?: string } | null>
const rerollRank = { none: 0, ones: 1, failed: 2 } as const
const modifiers = [
  [-1, '−1'],
  [0, '0'],
  [1, '+1'],
] as const
const rerolls = [
  ['none', 'None'],
  ['ones', '1s'],
  ['failed', 'Failed'],
] as const
const matrixClass =
  'mt-3 grid grid-cols-2 items-center gap-x-2 gap-y-1.5 text-xs @md:grid-cols-[7rem_minmax(0,1fr)_minmax(0,1fr)] @md:gap-x-3 @md:gap-y-2'
const subheadingClass = 'eyebrow col-span-2 pt-2 text-faint @md:col-span-3'
const criticalHits = [
  [6, '6+'],
  [5, '5+'],
  [4, '4+'],
] as const
const criticalWounds = [...criticalHits, [3, '3+'], [2, '2+']] as const
const extraRolls = [
  [0, 'None'],
  [6, '6+'],
  [5, '5+'],
  [4, '4+'],
  [3, '3+'],
  [2, '2+'],
] as const
/** Label, field, and the range a situational rule plausibly moves it. */
const characteristics = [
  ['Strength', 'strength', -3, 4],
  ['Attacks', 'attacks', -1, 3],
  ['AP', 'ap', -1, 3],
  ['Damage', 'damage', -1, 3],
] as const
const sustainedAmounts: Record<string, WeaponAdjustment['sustained']> = {
  none: undefined,
  '1': 1,
  '2': 2,
  '3': 3,
  D3: { dice: 1, sides: 3, bonus: 0 },
}
const sustainedChoices = [
  ['none', '0'],
  ['1', '1'],
  ['2', '2'],
  ['3', '3'],
  ['D3', 'D3'],
] as const
const sustainedKey = (amount: WeaponAdjustment['sustained']) =>
  amount === undefined ? 'none' : typeof amount === 'number' ? String(amount) : 'D3'
const grants = [
  ['lethal', 'Lethal Hits'],
  ['devastating', 'Devastating Wounds'],
  ['damageReroll', 'Re-roll damage 1s'],
] as const
const signed = (value: number) => (value > 0 ? `+${value}` : value < 0 ? `−${-value}` : '0')
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
  attacker,
  defender,
  pending = false,
  failed = false,
  attackerControl,
  defenderControl,
  buffs,
}: {
  attacker: CombatantSnapshot | null
  defender: CombatantSnapshot | null
  pending?: boolean
  failed?: boolean
  attackerControl?: ReactNode
  defenderControl?: ReactNode
  buffs?: ReactNode
}) {
  const [adjustments, setAdjustments] = useState<CombatAdjustments>({})
  const [preferences, setPreferences] = useState<Record<string, string>>({})
  const [outcome, setOutcome] = useState<{ key: string; attempt: number; answer: CombatAnswer } | null>(null)
  const [retry, setRetry] = useState(0)
  const results = useRef<HTMLDivElement>(null)
  const [resultsVisible, setResultsVisible] = useState(true)
  useEffect(() => {
    const numbers = [...(results.current?.querySelectorAll('[data-result-numbers]') ?? [])]
    const visible = new Map<Element, boolean>()
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) visible.set(entry.target, entry.isIntersecting)
      setResultsVisible(numbers.every((element) => visible.get(element)))
    })
    for (const element of numbers) observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const [allocation, setAllocation] = useState<readonly string[]>([])
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
  const defencesIn = (phase: Phase) =>
    target?.target
      ? adjustCombatTarget(combatRuleDefences(target.target, defenceRules, phase, attackRules), adjustments.target ?? {})
      : null
  const rangedDefences = defencesIn('ranged')
  const meleeDefences = defencesIn('melee')
  const extraFeelNoPain = adjustments.feelNoPain ?? null
  const betterFeelNoPain = (printed: number | null | undefined) =>
    extraFeelNoPain && (!printed || extraFeelNoPain < printed) ? extraFeelNoPain : (printed ?? null)
  const withExtraFeelNoPain = (defences: CombatInput['target']) => ({ ...defences, feelNoPain: betterFeelNoPain(defences.feelNoPain) })
  const feelNoPain = betterFeelNoPain(
    rangedDefences?.feelNoPain === meleeDefences?.feelNoPain ? rangedDefences?.feelNoPain : target?.target?.feelNoPain,
  )
  const inheritedOptions = (phase: Phase) => ({
    ...DEFAULT_COMBAT_OPTIONS,
    ...combatRuleOptions(attackRules, 'attacker', phase),
    ...combatRuleOptions(defenceRules, 'defender', phase),
  })
  const options = (phase: Phase): CombatOptions => {
    const attack = combatRuleOptions(attackRules, 'attacker', phase)
    const defence = combatRuleOptions(defenceRules, 'defender', phase)
    const inherited = inheritedOptions(phase)
    const extra = adjustments[phase] ?? {}
    const better = (field: 'hitReroll' | 'woundReroll') =>
      rerollRank[extra[field] ?? 'none'] > rerollRank[inherited[field]] ? extra[field]! : inherited[field]
    return {
      ...inherited,
      cover: inherited.cover || Boolean(extra.cover),
      halfRange: inherited.halfRange || Boolean(extra.halfRange),
      heavy: inherited.heavy || Boolean(extra.heavy),
      charged: inherited.charged || Boolean(extra.charged),
      lethal: extra.lethal ?? inherited.lethal,
      indirectFire: extra.indirectFire ?? inherited.indirectFire,
      hitModifier: (attack.hitModifier ?? 0) + (defence.hitModifier ?? 0) + (extra.hitModifier ?? 0),
      woundModifier: (attack.woundModifier ?? 0) + (defence.woundModifier ?? 0) + (extra.woundModifier ?? 0),
      hitReroll: better('hitReroll'),
      woundReroll: better('woundReroll'),
      positiveWoundModifier:
        (attack.positiveWoundModifier ?? 0) + (defence.positiveWoundModifier ?? 0) + Math.max(0, extra.woundModifier ?? 0),
      psychicHitModifier: (attack.psychicHitModifier ?? 0) + (defence.psychicHitModifier ?? 0) + Math.max(0, extra.hitModifier ?? 0),
      phase,
    }
  }
  const attackSheet = attacker
    ? combatRuleProfiles(attacker.sheet, attackRules, 'attacker', defender?.sheet.keywords ?? [], defenceRules)
    : null
  const plans = {
    ranged:
      attacker && attackSheet ? combatPlan(attackSheet, attacker.carriers, defender?.sheet.keywords ?? [], 'ranged', preferences) : null,
    melee:
      attacker && attackSheet ? combatPlan(attackSheet, attacker.carriers, defender?.sheet.keywords ?? [], 'melee', preferences) : null,
  }
  const scenario = (phase: Phase): CombatInput | null => {
    const plan = plans[phase]
    const defences = phase === 'ranged' ? rangedDefences : meleeDefences
    const mortalWounds = combatRuleMortals(attackRules, phase, defender?.sheet.keywords ?? [], plan?.used ?? [], attacker?.models ?? 0)
    return attacker &&
      defences &&
      !attacker.allocationRequired &&
      plan &&
      (plan.weapons.length || mortalWounds.length) &&
      !plan.errors.length
      ? {
          target: withExtraFeelNoPain(defences),
          weapons: combatRuleWeapons(
            attacker.sheet,
            combatRuleWeapons(attacker.sheet, plan.used, attackRules, 'attacker', phase, defender?.sheet.keywords ?? []).map(
              (weapon, index) => ({
                weapon,
                count: weapon.count,
                profile: plan.used[index]!.profile,
              }),
            ),
            defenceRules,
            'defender',
            phase,
            attacker?.sheet.keywords ?? [],
          ).map((weapon) => adjustCombatWeapon(weapon, adjustments.weapons?.[phase] ?? {})),
          options: options(phase),
          ...(mortalWounds.length ? { mortalWounds } : {}),
        }
      : null
  }
  const scenarios: CombatRequest = { ranged: scenario('ranged'), melee: scenario('melee') }
  const requestKey = JSON.stringify(scenarios)
  const canSimulate = Boolean(scenarios.ranged || scenarios.melee)
  const updating = pending || (canSimulate && (outcome?.key !== requestKey || outcome?.attempt !== retry))
  useEffect(() => {
    if (pending || failed) return
    const request = JSON.parse(requestKey) as CombatRequest
    if (!request.ranged && !request.melee) return
    let active = true
    let worker: Worker | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    const stop = () => {
      active = false
      worker?.terminate()
      clearTimeout(timer)
    }
    const fail = (message: string) => {
      if (!active) return
      setOutcome({
        key: requestKey,
        attempt: retry,
        answer: { ranged: request.ranged ? { error: message } : null, melee: request.melee ? { error: message } : null },
      })
      stop()
    }
    try {
      worker = new Worker(new URL('./combat.worker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = (event: MessageEvent<CombatAnswer>) => {
        if (active) setOutcome({ key: requestKey, attempt: retry, answer: event.data })
        stop()
      }
      worker.onerror = () => fail('The calculation failed. Try again.')
      timer = setTimeout(() => fail('The calculation took too long. Reduce the model count and try again.'), 15_000)
      worker.postMessage(request)
    } catch {
      fail('The calculation could not start. This browser must support Web Workers.')
    }
    return stop
  }, [requestKey, pending, failed, retry])
  const change = <K extends keyof CombatOptions>(phase: Phase, name: K, value: CombatOptions[K]) =>
    setAdjustments((current) => ({ ...current, [phase]: { ...current[phase], [name]: value } }))
  const changeWeapon = <K extends keyof WeaponAdjustment>(phase: Phase, name: K, value: WeaponAdjustment[K]) =>
    setAdjustments((current) => ({ ...current, weapons: { ...current.weapons, [phase]: { ...current.weapons?.[phase], [name]: value } } }))
  const changeTarget = <K extends keyof TargetAdjustment>(name: K, value: TargetAdjustment[K]) =>
    setAdjustments((current) => ({ ...current, target: { ...current.target, [name]: value } }))
  const weaponAdjustment = (phase: Phase) => adjustments.weapons?.[phase] ?? {}
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
          {attackerControl ?? <CombatantHeading side="Attacker" unit={attacker} />}
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
          <p role="alert" className="mb-3 text-sm text-amber-400">
            Choose the attacker's surviving models and weapons to calculate attacks.
          </p>
        ) : null}
        {target?.error ? (
          <p role="alert" className="mb-3 text-sm text-amber-400">
            {target.error}
          </p>
        ) : null}
        <div ref={results} className="grid gap-3 @xl:grid-cols-2">
          {phases.map(([phase, title]) => {
            const plan = plans[phase]
            const answer = outcome?.answer[phase]
            const valid = Boolean(scenario(phase))
            const result = valid ? answer?.result : undefined
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
                <div data-result-numbers className="my-3 grid min-h-20 grid-cols-3 gap-2 border-y border-edge py-3">
                  {[
                    { label: 'Wounds lost', value: result?.meanDamage.toFixed(2), distribution: result?.damage },
                    { label: 'Models lost', value: result?.meanKills.toFixed(2), distribution: result?.kills },
                    { label: 'Unit destroyed', value: result ? `${(result.wipe * 100).toFixed(1)}%` : undefined },
                  ].map(({ label, value, distribution }) => (
                    <div key={label}>
                      <p className="text-xs text-dim">{label}</p>
                      {distribution && value ? (
                        <CombatEstimate
                          label={`${title} · ${label}`}
                          value={value}
                          distribution={distribution}
                          muted={updating || failed}
                        />
                      ) : (
                        <p className={`readout mt-1 text-xl ${updating || failed ? 'text-dim' : 'text-primary'}`}>{value ?? '—'}</p>
                      )}
                      {label !== 'Unit destroyed' ? <p className="text-xs text-faint">average</p> : null}
                    </div>
                  ))}
                </div>
                {!plan?.used.length ? (
                  <p className="text-xs text-dim">
                    {attacker ? `No ${title.toLowerCase()} weapons equipped.` : 'Equipped weapons appear here.'}
                  </p>
                ) : null}
                {plan?.errors.map((message) => (
                  <p key={message} role="alert" className="mt-2 text-xs text-amber-400">
                    {message}
                  </p>
                ))}
                {error ? (
                  <div role="alert" className="mt-2 text-xs text-amber-400">
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
                      choices={choice.options.map((option) => [option.value, option.label] as const)}
                      onChange={(value) => setPreferences((current) => ({ ...current, [choice.key]: value }))}
                    />
                  ))}
                  <div className="space-y-1.5">
                    <WeaponProfiles
                      weapons={plan?.used.map(({ profile, count }) => ({ ...profile, count })) ?? []}
                      rules={attacker?.sheet.keywordRules ?? []}
                    />
                  </div>
                </div>
              </section>
            )
          })}
        </div>
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
        <section aria-label="Conditions" className="mt-4 border-t border-edge pt-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="rubric">Conditions</h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setAdjustments({})
                setPreferences({})
              }}
            >
              <RotateCcw aria-hidden />
              Reset adjustments
            </Button>
          </div>
          <div className={matrixClass}>
            <span className="hidden @md:block" />
            {phases.map(([phase, title]) => (
              <h3 key={phase} className="rubric flex items-center gap-1.5">
                <PhaseIcon phase={phase} />
                {title}
              </h3>
            ))}
            <h4 className={subheadingClass}>Rolls</h4>
            {(
              [
                ['Hit roll', 'hit modifier', 'hitModifier'],
                ['Wound roll', 'wound modifier', 'woundModifier'],
              ] as const
            ).map(([label, name, field]) => (
              <Fragment key={field}>
                <span className="col-span-2 pt-1 text-dim @md:col-span-1 @md:pt-0">{label}</span>
                {phases.map(([phase, title]) => (
                  <Segmented
                    key={phase}
                    label={`${title} ${name}`}
                    value={adjustments[phase]?.[field] ?? 0}
                    choices={modifiers}
                    onChange={(value) => change(phase, field, value)}
                  />
                ))}
              </Fragment>
            ))}
            {(
              [
                ['Re-roll hits', 'hit re-rolls', 'hitReroll'],
                ['Re-roll wounds', 'wound re-rolls', 'woundReroll'],
              ] as const
            ).map(([label, name, field]) => (
              <Fragment key={field}>
                <span className="col-span-2 pt-1 text-dim @md:col-span-1 @md:pt-0">{label}</span>
                {phases.map(([phase, title]) => (
                  <Segmented
                    key={phase}
                    label={`${title} ${name}`}
                    value={adjustments[phase]?.[field] ?? 'none'}
                    choices={rerolls}
                    onChange={(value) => change(phase, field, value)}
                  />
                ))}
              </Fragment>
            ))}
            {(
              [
                ['Critical hits', 'critical hits', 'criticalHit', criticalHits],
                ['Critical wounds', 'critical wounds', 'criticalWound', criticalWounds],
              ] as const
            ).map(([label, name, field, choices]) => (
              <Fragment key={field}>
                <span className="col-span-2 pt-1 text-dim @md:col-span-1 @md:pt-0">{label}</span>
                {phases.map(([phase, title]) => (
                  <Segmented
                    key={phase}
                    label={`${title} ${name}`}
                    value={weaponAdjustment(phase)[field] ?? 6}
                    choices={choices}
                    onChange={(value) => changeWeapon(phase, field, value === 6 ? undefined : value)}
                  />
                ))}
              </Fragment>
            ))}
            <h4 className={subheadingClass}>Characteristics</h4>
            <span className="col-span-2 pt-1 text-dim @md:col-span-1 @md:pt-0">Skill</span>
            {phases.map(([phase, title]) => (
              <Segmented
                key={phase}
                label={`${title} skill`}
                value={weaponAdjustment(phase).skill ?? 0}
                choices={modifiers}
                onChange={(value) => changeWeapon(phase, 'skill', value)}
              />
            ))}
            {characteristics.map(([label, field, minimum, maximum]) => (
              <Fragment key={field}>
                <span className="col-span-2 pt-1 text-dim @md:col-span-1 @md:pt-0">{label}</span>
                {phases.map(([phase, title]) => {
                  const value = weaponAdjustment(phase)[field] ?? 0
                  return (
                    <Stepper
                      key={phase}
                      label={`${title} ${label}`}
                      countLabel={`${title} ${label}`}
                      count={value}
                      display={signed(value)}
                      onRemove={value > minimum ? () => changeWeapon(phase, field, value - 1) : undefined}
                      onAdd={value < maximum ? () => changeWeapon(phase, field, value + 1) : undefined}
                    />
                  )
                })}
              </Fragment>
            ))}
            <h4 className={subheadingClass}>Abilities</h4>
            <span className="col-span-2 pt-1 text-dim @md:col-span-1 @md:pt-0">Sustained Hits</span>
            {phases.map(([phase, title]) => (
              <Segmented
                key={phase}
                label={`${title} Sustained Hits`}
                value={sustainedKey(weaponAdjustment(phase).sustained)}
                choices={sustainedChoices}
                onChange={(value) => changeWeapon(phase, 'sustained', sustainedAmounts[value])}
              />
            ))}
            <span className="col-span-2 pt-1 text-dim @md:col-span-1 @md:pt-0 @md:self-start @md:pt-2">Granted</span>
            <div className="col-span-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              {phases.map(([phase, title]) => (
                <div key={phase} className="flex flex-wrap items-center gap-1.5">
                  <PhaseIcon phase={phase} title={title} />
                  {grants.map(([field, name]) => (
                    <Chip
                      key={field}
                      label={name}
                      ariaLabel={`${title} ${name}`}
                      checked={Boolean(weaponAdjustment(phase)[field])}
                      onChange={(value) => changeWeapon(phase, field, value)}
                    />
                  ))}
                </div>
              ))}
            </div>
            <span className="col-span-2 pt-1 text-dim @md:col-span-1 @md:pt-0 @md:self-start @md:pt-2">Situation</span>
            <div className="col-span-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              {phases.map(([phase, title]) => (
                <div key={phase} className="flex flex-wrap items-center gap-1.5">
                  <PhaseIcon phase={phase} title={title} />
                  {situations[phase].map(([field, label]) => (
                    <Chip
                      key={field}
                      label={label}
                      checked={inheritedOptions(phase)[field] || Boolean(adjustments[phase]?.[field])}
                      disabled={inheritedOptions(phase)[field]}
                      onChange={(value) => change(phase, field, value)}
                    />
                  ))}
                  {plans[phase]?.weapons.some((weapon) => weapon.lethal) ? (
                    <Chip
                      label="Use Lethal Hits"
                      ariaLabel={`${title} use Lethal Hits`}
                      checked={options(phase).lethal}
                      onChange={(value) => change(phase, 'lethal', value)}
                    />
                  ) : null}
                </div>
              ))}
            </div>
            {plans.ranged?.weapons.some((weapon) => weapon.indirectFire) ? (
              <>
                <span className="col-span-2 pt-1 text-dim @md:col-span-1 @md:pt-0">Indirect fire</span>
                <div className="col-span-2">
                  <Segmented
                    label="Indirect shooting"
                    value={options('ranged').indirectFire ?? 'direct'}
                    choices={[
                      ['direct', 'Off'],
                      ['unobserved', 'Unobserved or moving'],
                      ['spotted', 'Stationary and spotted'],
                    ]}
                    onChange={(value) => change('ranged', 'indirectFire', value)}
                  />
                </div>
              </>
            ) : null}
          </div>
          <div className={`${matrixClass} mt-4 border-t border-edge pt-3`}>
            <h3 className="rubric col-span-2 @md:col-span-3">Defender</h3>
            {(
              [
                ['Toughness', 'toughness'],
                ['Armour save', 'save'],
              ] as const
            ).map(([label, field]) => (
              <Fragment key={field}>
                <span className="col-span-2 pt-1 text-dim @md:col-span-1 @md:pt-0">{label}</span>
                <div className="col-span-2">
                  <Segmented
                    label={`Defender ${label.toLowerCase()}`}
                    value={adjustments.target?.[field] ?? 0}
                    choices={modifiers}
                    onChange={(value) => changeTarget(field, value)}
                  />
                </div>
              </Fragment>
            ))}
            <span className="col-span-2 pt-1 text-dim @md:col-span-1 @md:pt-0">Extra InSv</span>
            <div className="col-span-2">
              <Segmented
                label="Extra invulnerable save"
                value={adjustments.target?.invulnerable ?? 0}
                choices={extraRolls.slice(0, -1)}
                onChange={(value) => changeTarget('invulnerable', value || null)}
              />
            </div>
            <span className="col-span-2 pt-1 text-dim @md:col-span-1 @md:pt-0">Extra FNP</span>
            <div className="col-span-2">
              <Segmented
                label="Extra Feel No Pain"
                value={extraFeelNoPain ?? 0}
                choices={extraRolls}
                onChange={(value) => setAdjustments((current) => ({ ...current, feelNoPain: value || null }))}
              />
            </div>
            <span className="col-span-2 pt-1 text-dim @md:col-span-1 @md:pt-0">Re-roll saves</span>
            <div className="col-span-2">
              <Segmented
                label="Defender save re-rolls"
                value={adjustments.target?.saveReroll ?? 'none'}
                choices={rerolls}
                onChange={(value) => changeTarget('saveReroll', value === 'none' ? undefined : value)}
              />
            </div>
            <span className="col-span-2 pt-1 text-dim @md:col-span-1 @md:pt-0">Damage</span>
            <div className="col-span-2 flex flex-wrap gap-1.5">
              <Chip
                label="−1 Damage"
                checked={Boolean(adjustments.target?.damageReduction)}
                onChange={(value) => changeTarget('damageReduction', value)}
              />
              <Chip
                label="Half damage"
                checked={Boolean(adjustments.target?.halveDamage)}
                onChange={(value) => changeTarget('halveDamage', value)}
              />
            </div>
          </div>
          {sources.length ? (
            <p className="mt-3 text-xs text-dim">Inherited: {sources.join(' · ')}. Evaluated profile changes are included.</p>
          ) : null}
        </section>
      </div>
      {resultsVisible || !canSimulate ? null : (
        <div
          aria-label="Results summary"
          data-results-summary
          className="sticky bottom-0 z-20 grid grid-cols-[auto_repeat(3,minmax(0,1fr))] items-baseline gap-x-3 border-t border-edge bg-panel/95 px-3 py-2 text-xs text-dim backdrop-blur sm:px-4"
        >
          <span />
          {['Wounds', 'Models', 'Destroyed'].map((label) => (
            <span key={label} className="truncate">
              {label}
            </span>
          ))}
          {phases.map(([phase, title]) => {
            const result = scenario(phase) ? outcome?.answer[phase]?.result : undefined
            return (
              <Fragment key={phase}>
                <span className="rubric">{title}</span>
                {(
                  [
                    ['Wounds lost', result?.meanDamage.toFixed(2)],
                    ['Models lost', result?.meanKills.toFixed(2)],
                    ['Destroyed', result ? `${(result.wipe * 100).toFixed(1)}%` : undefined],
                  ] as const
                ).map(([label, value]) => (
                  <span key={label} className={`readout text-sm ${updating || failed ? 'text-dim' : 'text-primary'}`}>
                    {value ?? '—'}
                  </span>
                ))}
              </Fragment>
            )
          })}
        </div>
      )}
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

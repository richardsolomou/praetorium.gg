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
import { Chip, Choice } from './CombatControls'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
  const activeCount = (phase: Phase) =>
    [...Object.values(adjustments[phase] ?? {}), ...Object.values(weaponAdjustment(phase))].filter(
      (value) => value !== undefined && value !== false && value !== 0 && value !== 'none' && value !== 'direct',
    ).length
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
        <section aria-label="Modifiers" className="mt-4 border-t border-edge pt-3">
          <Tabs defaultValue="ranged" className="flex-col gap-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <h2 className="rubric">Modifiers</h2>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto @xl:order-last"
                onClick={() => {
                  setAdjustments({})
                  setPreferences({})
                }}
              >
                <RotateCcw aria-hidden />
                Reset
              </Button>
              <TabsList
                aria-label="Attack modifiers"
                className="order-last h-8! w-full border border-edge/60 bg-transparent @xl:order-none @xl:w-fit"
              >
                {phases.map(([phase, title]) => {
                  const active = activeCount(phase)
                  return (
                    <TabsTrigger key={phase} value={phase} className="px-3 text-xs data-active:bg-raised data-active:text-bone">
                      <PhaseIcon phase={phase} />
                      {title}
                      {active ? <span className="readout text-xs text-primary">{active}</span> : null}
                    </TabsTrigger>
                  )
                })}
              </TabsList>
            </div>
            {phases.map(([phase, title]) => {
              const weapon = weaponAdjustment(phase)
              const set =
                <K extends keyof WeaponAdjustment>(field: K) =>
                (value: WeaponAdjustment[K]) =>
                  changeWeapon(phase, field, value)
              const skill = phase === 'ranged' ? 'BS' : 'WS'
              return (
                <TabsContent key={phase} value={phase} aria-label={`${title} modifiers`} className="space-y-2.5">
                  <ChipRow label="Rolls">
                    <ChipFamily
                      value={adjustments[phase]?.hitModifier}
                      options={signedOptions([1, -1], 'Hit')}
                      onChange={(value) => change(phase, 'hitModifier', value ?? 0)}
                    />
                    <ChipFamily
                      value={adjustments[phase]?.woundModifier}
                      options={signedOptions([1, -1], 'Wound')}
                      onChange={(value) => change(phase, 'woundModifier', value ?? 0)}
                    />
                    <ChipFamily
                      value={adjustments[phase]?.hitReroll}
                      options={hitRerolls}
                      onChange={(value) => change(phase, 'hitReroll', value ?? 'none')}
                    />
                    <ChipFamily
                      value={adjustments[phase]?.woundReroll}
                      options={woundRerolls}
                      onChange={(value) => change(phase, 'woundReroll', value ?? 'none')}
                    />
                    <ChipFamily value={weapon.criticalHit} options={rollOptions([5, 4], 'Crit hits ')} onChange={set('criticalHit')} />
                    <ChipFamily
                      value={weapon.criticalWound}
                      options={rollOptions([5, 4, 3, 2], 'Crit wounds ')}
                      onChange={set('criticalWound')}
                    />
                  </ChipRow>
                  <ChipRow label="Stats">
                    <ChipFamily value={weapon.skill} options={signedOptions([1, -1], skill)} onChange={set('skill')} />
                    <ChipFamily value={weapon.strength} options={signedOptions([1, 2, 3, -1], 'S')} onChange={set('strength')} />
                    <ChipFamily value={weapon.attacks} options={signedOptions([1, 2, -1], 'A')} onChange={set('attacks')} />
                    <ChipFamily value={weapon.ap} options={signedOptions([1, 2, -1], 'AP')} onChange={set('ap')} />
                    <ChipFamily value={weapon.damage} options={signedOptions([1, 2, -1], 'D')} onChange={set('damage')} />
                  </ChipRow>
                  <ChipRow label="Abilities">
                    <ChipFamily
                      value={sustainedKey(weapon.sustained)}
                      options={sustainedOptions}
                      onChange={(value) => changeWeapon(phase, 'sustained', value === undefined ? undefined : sustainedAmounts[value])}
                    />
                    {grants.map(([field, name]) => (
                      <ChipFamily key={field} value={weapon[field]} options={[[true, name]]} onChange={set(field)} />
                    ))}
                  </ChipRow>
                  <ChipRow label="Situation">
                    {situations[phase].map(([field, label]) => (
                      <Chip
                        key={field}
                        label={label}
                        checked={inheritedOptions(phase)[field] || Boolean(adjustments[phase]?.[field])}
                        disabled={inheritedOptions(phase)[field]}
                        onChange={(value) => change(phase, field, value)}
                      />
                    ))}
                    {phase === 'ranged' && plans.ranged?.weapons.some((entry) => entry.indirectFire) ? (
                      <ChipFamily
                        value={adjustments.ranged?.indirectFire === 'direct' ? undefined : adjustments.ranged?.indirectFire}
                        options={
                          [
                            ['unobserved', 'Indirect, unobserved or moving'],
                            ['spotted', 'Indirect, stationary and spotted'],
                          ] as const
                        }
                        onChange={(value) => change('ranged', 'indirectFire', value ?? 'direct')}
                      />
                    ) : null}
                    {plans[phase]?.weapons.some((entry) => entry.lethal) ? (
                      <Chip
                        label="Decline Lethal Hits"
                        checked={!options(phase).lethal}
                        onChange={(value) => change(phase, 'lethal', !value)}
                      />
                    ) : null}
                  </ChipRow>
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
              />
              <ChipFamily
                value={adjustments.target?.save}
                options={signedOptions([1, -1], 'Sv')}
                onChange={(value) => changeTarget('save', value)}
              />
            </ChipRow>
            <ChipRow label="Protection">
              <ChipFamily
                value={adjustments.target?.invulnerable ?? undefined}
                options={[6, 5, 4, 3].map((roll) => [roll, `${roll}++`] as const)}
                onChange={(value) => changeTarget('invulnerable', value)}
              />
              <ChipFamily
                value={extraFeelNoPain ?? undefined}
                options={rollOptions([6, 5, 4, 3, 2], 'FNP ')}
                onChange={(value) => setAdjustments((current) => ({ ...current, feelNoPain: value ?? null }))}
              />
              <ChipFamily
                value={adjustments.target?.saveReroll}
                options={saveRerolls}
                onChange={(value) => changeTarget('saveReroll', value)}
              />
              <ChipFamily
                value={adjustments.target?.damageReduction}
                options={[[true, '−1 Damage']]}
                onChange={(value) => changeTarget('damageReduction', value)}
              />
              <ChipFamily
                value={adjustments.target?.halveDamage}
                options={[[true, 'Half damage']]}
                onChange={(value) => changeTarget('halveDamage', value)}
              />
            </ChipRow>
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
}: {
  value: T | undefined
  options: readonly (readonly [T, string])[]
  onChange: (value: T | undefined) => void
}) {
  return options.map(([option, label]) => (
    <Chip key={label} label={label} checked={value === option} onChange={(checked) => onChange(checked ? option : undefined)} />
  ))
}

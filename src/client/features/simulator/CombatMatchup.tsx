import { useEffect, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { ArrowLeftRight } from 'lucide-react'
import { ProfileGrid, WeaponProfiles } from '../builder/DatasheetPanel'
import type { Datasheet } from '../../../contracts/catalogue'
import { DEFAULT_COMBAT_OPTIONS, type CombatInput, type CombatOptions, type CombatResult } from '../../../core/combat'
import type { CombatCarrier } from '../../../core/combatLoadout'
import { combatPlan, combatTarget } from '../../../core/combatProfiles'
import { RuleText } from '../../components/RuleText'
import { Choice, rerolls, Toggle } from './CombatControls'
import { CombatHistogram } from './CombatHistogram'

export type CombatantSnapshot = { sheet: Datasheet; models: number; carriers: readonly CombatCarrier[] }
type Phase = CombatOptions['phase']
export type CombatContext = {
  ranged?: Partial<Omit<CombatOptions, 'phase'>>
  melee?: Partial<Omit<CombatOptions, 'phase'>>
  feelNoPain?: number | null
  sources?: readonly string[]
}
export type CombatRequest = Record<Phase, CombatInput | null>
export type CombatAnswer = Record<Phase, { result?: CombatResult; error?: string } | null>
const NO_CONTEXT: CombatContext = {}
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
  context = NO_CONTEXT,
  attackerControl,
  defenderControl,
  onSwap,
}: {
  attacker: CombatantSnapshot | null
  defender: CombatantSnapshot | null
  pending?: boolean
  failed?: boolean
  context?: CombatContext
  attackerControl?: ReactNode
  defenderControl?: ReactNode
  onSwap?: () => void
}) {
  const [overrides, setOverrides] = useState<CombatContext>({})
  const [preferences, setPreferences] = useState<Record<string, string>>({})
  const [outcome, setOutcome] = useState<{ key: string; attempt: number; answer: CombatAnswer } | null>(null)
  const [retry, setRetry] = useState(0)
  const target = defender ? combatTarget(defender.sheet, defender.models) : null
  const defaultFeelNoPain = context.feelNoPain === undefined ? (target?.target?.feelNoPain ?? null) : context.feelNoPain
  const feelNoPain = overrides.feelNoPain === undefined ? defaultFeelNoPain : overrides.feelNoPain
  const options = (phase: Phase): CombatOptions => ({ ...DEFAULT_COMBAT_OPTIONS, ...context[phase], ...overrides[phase], phase })
  const plans = {
    ranged: attacker ? combatPlan(attacker.sheet, attacker.carriers, defender?.sheet.keywords ?? [], 'ranged', preferences) : null,
    melee: attacker ? combatPlan(attacker.sheet, attacker.carriers, defender?.sheet.keywords ?? [], 'melee', preferences) : null,
  }
  const scenario = (phase: Phase): CombatInput | null => {
    const plan = plans[phase]
    return target?.target && plan?.weapons.length && !plan.errors.length
      ? { target: { ...target.target, feelNoPain }, weapons: plan.weapons, options: options(phase) }
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
    setOverrides((current) => ({ ...current, [phase]: { ...current[phase], [name]: value } }))
  const sources = [
    ...new Set([
      ...(context.sources ?? []),
      ...[attacker, defender].flatMap(
        (unit) => unit?.sheet.profiles.flatMap((profile) => profile.values.flatMap((value) => value.modifiers ?? [])) ?? [],
      ),
    ]),
  ]
  return (
    <div className="@container min-w-0 border border-edge bg-panel" aria-label="Combat matchup">
      <div className="grid divide-y divide-edge @xl:grid-cols-2 @xl:divide-x @xl:divide-y-0">
        <section aria-label="Attacker" className="min-w-0">
          {attackerControl ?? <CombatantHeading side="Attacker" unit={attacker} />}
          <CombatDefences unit={attacker} />
        </section>
        <section aria-label="Defender" className="relative min-w-0">
          {onSwap ? (
            <Button
              variant="outline"
              size="icon-sm"
              className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1/2 bg-panel @xl:left-0 @xl:top-1/2"
              aria-label="Swap attacker and defender"
              title="Swap attacker and defender"
              onClick={onSwap}
              disabled={!attacker || !defender || pending || failed}
            >
              <ArrowLeftRight className="size-4 rotate-90 @xl:rotate-0" />
            </Button>
          ) : null}
          {defenderControl ?? <CombatantHeading side="Defender" unit={defender} />}
          <CombatDefences unit={defender} feelNoPain={feelNoPain} />
        </section>
      </div>
      <div className="border-t border-edge p-3 sm:p-4">
        {target?.error ? (
          <p role="alert" className="mb-3 text-sm text-amber-400">
            {target.error}
          </p>
        ) : null}
        <div className="grid gap-3 @xl:grid-cols-2">
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
                className="min-w-0 border border-edge bg-sunken p-3"
              >
                <h2 className="rubric">{title}</h2>
                <div className="mt-3 grid min-h-20 grid-cols-3 gap-2">
                  {[
                    ['Wounds lost', result?.meanDamage.toFixed(2)],
                    ['Models lost', result?.meanKills.toFixed(2)],
                    ['Unit destroyed', result ? `${(result.wipe * 100).toFixed(1)}%` : undefined],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <p className="text-xs text-dim">{label}</p>
                      <p className={`readout mt-1 text-xl ${updating || failed ? 'text-dim' : 'text-primary'}`}>{value ?? '—'}</p>
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
                  {result ? (
                    <>
                      <CombatHistogram title="Models destroyed" distribution={result.kills} />
                      <CombatHistogram title="Wounds lost" distribution={result.damage} />
                    </>
                  ) : null}
                </div>
              </section>
            )
          })}
        </div>
        <section aria-label="Conditions and rules" className="mt-4 border-t border-edge pt-3">
          <h2 className="rubric">Conditions & rules{sources.length ? ` · ${sources.length} inherited` : ''}</h2>
          <div className="mt-4 grid gap-5 @xl:grid-cols-2">
            {phases.map(([phase, title]) => {
              const current = options(phase)
              return (
                <fieldset key={phase} className="min-w-0 space-y-3">
                  <legend className="rubric mb-3">{title} conditions</legend>
                  <div className="grid grid-cols-2 gap-3">
                    <Choice
                      label="Hit modifier"
                      ariaLabel={`${title} hit modifier`}
                      value={current.hitModifier}
                      choices={[
                        [-1, '−1'],
                        [0, 'None'],
                        [1, '+1'],
                      ]}
                      onChange={(value) => change(phase, 'hitModifier', value)}
                    />
                    <Choice
                      label="Wound modifier"
                      ariaLabel={`${title} wound modifier`}
                      value={current.woundModifier}
                      choices={[
                        [-1, '−1'],
                        [0, 'None'],
                        [1, '+1'],
                      ]}
                      onChange={(value) => change(phase, 'woundModifier', value)}
                    />
                    <Choice
                      label="Hit re-rolls"
                      ariaLabel={`${title} hit re-rolls`}
                      value={current.hitReroll}
                      choices={rerolls}
                      onChange={(value) => change(phase, 'hitReroll', value)}
                    />
                    <Choice
                      label="Wound re-rolls"
                      ariaLabel={`${title} wound re-rolls`}
                      value={current.woundReroll}
                      choices={rerolls}
                      onChange={(value) => change(phase, 'woundReroll', value)}
                    />
                  </div>
                  <div className="space-y-3 text-xs">
                    {phase === 'ranged' ? (
                      <>
                        <Toggle
                          label="Defender has cover (−1 BS)"
                          checked={current.cover}
                          onChange={(value) => change(phase, 'cover', value)}
                        />
                        <Toggle
                          label="All weapons within half range"
                          checked={current.halfRange}
                          onChange={(value) => change(phase, 'halfRange', value)}
                        />
                        <Toggle label="Heavy conditions met" checked={current.heavy} onChange={(value) => change(phase, 'heavy', value)} />
                        <p className="text-faint">Heavy: unengaged, not set up this turn, and no model moved more than 3″.</p>
                      </>
                    ) : (
                      <Toggle
                        label="Attacker charged this turn"
                        checked={current.charged}
                        onChange={(value) => change(phase, 'charged', value)}
                      />
                    )}
                    <Toggle
                      label={`${title}: use Lethal Hits`}
                      checked={current.lethal}
                      onChange={(value) => change(phase, 'lethal', value)}
                    />
                  </div>
                </fieldset>
              )
            })}
          </div>
          <div className="mt-4 flex items-end gap-3">
            <div className="max-w-52 flex-1">
              <Choice
                label="Defender Feel No Pain"
                value={feelNoPain ?? 0}
                choices={[
                  [0, 'None'],
                  [6, '6+'],
                  [5, '5+'],
                  [4, '4+'],
                  [3, '3+'],
                  [2, '2+'],
                ]}
                onChange={(value) => setOverrides((current) => ({ ...current, feelNoPain: value || null }))}
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setOverrides({})
                setPreferences({})
              }}
            >
              Reset adjustments
            </Button>
          </div>
          {sources.length ? (
            <p className="mt-4 text-xs text-dim">Inherited: {sources.join(' · ')}. Evaluated profile changes are included.</p>
          ) : null}
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
                        <h4 className="text-sm">{ability.name}</h4>
                        {ability.description ? (
                          <RuleText text={ability.description} rules={unit.sheet.keywordRules} />
                        ) : (
                          <p className="text-xs text-faint">No description available.</p>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        </section>
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

function CombatDefences({ unit, feelNoPain }: { unit: CombatantSnapshot | null; feelNoPain?: number | null }) {
  const target = unit ? combatTarget(unit.sheet, unit.models).target : null
  const fnp = feelNoPain === undefined ? target?.feelNoPain : feelNoPain
  const values = [
    { name: 'T', value: target ? String(target.toughness) : '—' },
    { name: 'Sv', value: target ? `${target.save}+` : '—' },
    { name: 'W', value: target ? String(target.wounds) : '—' },
    { name: 'InSv', value: target?.invulnerable ? `${target.invulnerable}+` : '—' },
    { name: 'FNP', value: fnp ? `${fnp}+` : '—' },
  ]
  return (
    <div className="px-3 pb-3 sm:px-4 sm:pb-4">
      <ProfileGrid values={values} columns={5} />
    </div>
  )
}

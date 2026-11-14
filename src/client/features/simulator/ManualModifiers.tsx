import { useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { RotateCcw } from 'lucide-react'
import { COMBAT_PHASES, type CombatOptions } from '../../../core/combat'
import type { CombatAdjustments, TargetAdjustment, WeaponAdjustment } from '../../../core/combatAdjustments'
import { Chip, NoEffect, PhaseIcon } from './CombatControls'
import { signedLabel } from '../../text'
import { Stepper } from '../../components/Stepper'
import {
  commandRerolls,
  grants,
  phases,
  sustainedKey,
  type CombatMatchupView,
  type MatchupModifiers,
  type PhaseScope,
} from './matchupModifiers'

const sustainedAmounts: Record<string, WeaponAdjustment['sustained']> = {
  '1': 1,
  '2': 2,
  '3': 3,
  D3: { dice: 1, sides: 3, bonus: 0 },
}
const rerollOptions = (roll: string, rolls: string) =>
  [
    ['ones', `Re-roll ${roll} 1s`],
    ['failed', `Re-roll ${rolls}`],
  ] as const
const hitRerolls = rerollOptions('hit', 'hits')
const woundRerolls = rerollOptions('wound', 'wounds')
const saveRerolls = rerollOptions('save', 'saves')
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

export function ManualModifiers({
  matchup,
  adjustments,
  onAdjustmentsChange: setAdjustments,
  modifiers: { modifierChoiceHasEffect, noEffect, noEffectReason },
  initiallyOpen,
  startOpen,
  onReset,
}: {
  matchup: CombatMatchupView
  adjustments: CombatAdjustments
  onAdjustmentsChange: Dispatch<SetStateAction<CombatAdjustments>>
  modifiers: MatchupModifiers
  initiallyOpen: boolean
  /** Whether the section opens before the player toggles it. */
  startOpen: boolean
  onReset: () => void
}) {
  const [modifiersOpen, setModifiersOpen] = useState<boolean | null>(initiallyOpen ? true : null)
  const { plans, inheritedOptions } = matchup
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
  return (
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
            <TabsList aria-label="Attack modifiers" className="h-11! min-w-[min(100%,24rem)] flex-1 border border-edge bg-raised p-1">
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
            <Button variant="ghost" size="sm" className="@max-[31rem]:order-first" onClick={onReset}>
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
                      changeWeapon(scope, 'sustained', value === undefined ? undefined : value === '0' ? 0 : sustainedAmounts[value])
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
                        checked={!matchup.options(scope, adjustments).lethal}
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
              value={adjustments.feelNoPain ?? undefined}
              onChange={(value) => setAdjustments((current) => ({ ...current, feelNoPain: value ?? null }))}
              reason={noEffect('all', 'feelNoPain', 'feelNoPain', adjustments.feelNoPain ?? undefined)}
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

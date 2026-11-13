import { invalidWeaponChoices } from './combatPreferences'
import { useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { Button } from '@/components/ui/button'
import type { CombatPhase } from '../../../core/combat'
import { combatUnitKeywords } from '../../../core/combatUnit'
import { combatMatchup, noExclusions, type CombatantSnapshot, type CombatRequest } from '../../../core/combatMatchup'
import { combineWeaponAdjustments, type CombatAdjustments } from '../../../core/combatAdjustments'
import { CombatResults } from './CombatResults'
import { LoadoutOddsContext, LoadoutOptimizationContext, type LoadoutOptimization } from './LoadoutOdds'
import { useLoadoutOdds } from './useLoadoutOdds'
import type { MatchupSettings } from '../../../contracts/simulatorState'
import type { LoadoutSpace } from '../../../core/combatLoadouts'
import { Problem } from '../../components/Problem'
import { useStableValue } from '../../useStableValue'
import { useClientValue } from '../../useClientValue'
import { AppliedModifiers } from './AppliedModifiers'
import { CombatDefences } from './CombatDefences'
import { ManualModifiers } from './ManualModifiers'
import { matchupModifiers, phases, withoutCommandReroll } from './matchupModifiers'
import { PhaseWeapons } from './PhaseWeapons'
import { useCombatOutcome, type CombatEntryPoint } from './useCombatOutcome'
import { useStrongestPreferences } from './useStrongestPreferences'

let roomyAtLoad: boolean | undefined
// Read once a page load, so turning a tablet or resizing a window never closes a section someone is using.
const roomy = () => (roomyAtLoad ??= window.matchMedia('(min-width: 768px)').matches)

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
  const [excludedWeapons, setExcludedWeapons] = useState<Record<CombatPhase, string[]>>(initialSettings?.excluded ?? noExclusions())
  const [retry, setRetry] = useState(0)
  const [invalidatedChoice, setInvalidatedChoice] = useState(false)
  const [allocation, setAllocation] = useState<readonly string[]>(initialSettings?.allocation ?? [])
  useEffect(() => {
    onSettingsChange?.({ adjustments, preferences, excluded: excludedWeapons, allocation: [...allocation] })
  }, [adjustments, preferences, excludedWeapons, allocation, onSettingsChange])
  const { chosen, choosing } = useStrongestPreferences({
    attacker,
    defender,
    preferences,
    excludedWeapons,
    allocation,
    adjustments,
    retry,
    pending,
    failed,
  })
  const matchup = useMemo(
    () => combatMatchup(attacker, defender, { preferences: chosen, excluded: excludedWeapons, allocation }),
    [attacker, defender, chosen, excludedWeapons, allocation],
  )
  const { target, labels, attackRules, defenceRules, plans, sequenceError } = matchup
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
  const rangedDefences = matchup.defencesIn('ranged', adjustments)
  const meleeDefences = matchup.defencesIn('melee', adjustments)
  const extraFeelNoPain = adjustments.feelNoPain ?? null
  const betterFeelNoPain = (printed: number | null | undefined) =>
    extraFeelNoPain && (!printed || extraFeelNoPain < printed) ? extraFeelNoPain : (printed ?? null)
  const feelNoPain = betterFeelNoPain(
    rangedDefences?.feelNoPain === meleeDefences?.feelNoPain ? rangedDefences?.feelNoPain : target?.target?.feelNoPain,
  )
  const scenarios = useMemo<CombatRequest>(() => matchup.request(adjustments), [matchup, adjustments])
  const commandRerolled = Boolean(adjustments.all?.commandReroll || adjustments.ranged?.commandReroll || adjustments.melee?.commandReroll)
  const scenariosWithout = useMemo<CombatRequest | null>(() => {
    if (!commandRerolled) return null
    return matchup.request(withoutCommandReroll(adjustments))
  }, [commandRerolled, matchup, adjustments])
  const modifiers = matchupModifiers(matchup, adjustments, scenarios)
  const { outcome, currentOutcome, updating } = useCombatOutcome({
    scenarios,
    scenariosWithout,
    pending,
    failed,
    choosing,
    retry,
    entryPoint,
    onCompleted,
  })
  const retryCalculation = () => setRetry((value) => value + 1)
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
    results: currentOutcome
      ? {
          combined: currentOutcome.answer.combined?.result,
          ranged: currentOutcome.answer.ranged?.result,
          melee: currentOutcome.answer.melee?.result,
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
            {phases.map(([phase]) => (
              <PhaseWeapons
                key={phase}
                phase={phase}
                plan={plans[phase]}
                hitRolls={matchup.hitRolls(phase, adjustments)}
                statAdjustment={combineWeaponAdjustments(adjustments.weapons?.all ?? {}, adjustments.weapons?.[phase] ?? {})}
                attacker={attacker}
                busy={Boolean(scenarios[phase]) && updating && !failed}
                error={currentOutcome?.answer[phase]?.error}
                excluded={excludedWeapons[phase]}
                onRetry={retryCalculation}
                onChoose={(key, value) => {
                  setInvalidatedChoice(false)
                  setPreferences((current) => ({ ...current, [key]: value }))
                }}
                onIncludedChange={(key, included) =>
                  setExcludedWeapons((current) => ({
                    ...current,
                    [phase]: included ? current[phase].filter((candidate) => candidate !== key) : [...current[phase], key],
                  }))
                }
              />
            ))}
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
            <ManualModifiers
              matchup={matchup}
              adjustments={adjustments}
              onAdjustmentsChange={setAdjustments}
              modifiers={modifiers}
              initiallyOpen={Boolean(Object.keys(initialSettings?.adjustments ?? {}).length)}
              startOpen={startOpen}
              onReset={() => {
                setAdjustments({})
                setPreferences({})
                setInvalidatedChoice(false)
                setExcludedWeapons(noExclusions())
              }}
            />
            <AppliedModifiers
              attacker={attacker}
              defender={defender}
              plans={plans}
              excludedWeapons={excludedWeapons}
              scenarios={scenarios}
              phaseSummary={modifiers.phaseSummary}
            />
          </section>
        </div>
        {currentOutcome?.answer.combined?.error ? (
          <Problem className="mt-3">
            Combined estimate: {currentOutcome.answer.combined.error}
            <Button className="ml-2" size="sm" variant="outline" onClick={retryCalculation}>
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

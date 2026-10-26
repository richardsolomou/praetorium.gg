import { createContext, useContext, type ReactNode } from 'react'
import { COMBAT_PHASES, type CombatPhase, type CombatResult } from '../../../core/combat'
import { estimateKey, type LoadoutScoring, type LoadoutOptimizationMode, type OutcomePriority } from '../../../core/combatLoadouts'
import { HoverTooltip } from '../../components/HoverTooltip'
import type { OptionNote } from '../rosters/builder/LoadoutControls'
import type { LoadoutOdds } from './useLoadoutOdds'
import type { CombatRequest } from '../../../core/combatMatchup'
import { Button } from '@/components/ui/button'
import { countLabel } from '../../text'
import { PHASE_TITLES, PhaseIcon } from './CombatControls'

const percent = (value: number) => {
  const chance = value * 100
  if (chance > 0 && chance < 0.01) return '<0.01%'
  return `${chance.toFixed(chance > 0 && chance < 1 ? 2 : 1)}%`
}
const bestLabels: Record<OutcomePriority, string> = { wipe: 'Best kill %', meanKills: 'Best models', meanDamage: 'Best wounds' }
const bestReasons: Record<OutcomePriority, string> = {
  wipe: 'Highest kill chance, even if another option averages more wounds.',
  meanKills: 'Kill chances are tied; this destroys more models on average.',
  meanDamage: 'Kill chance and average models are tied; this causes more wounds on average.',
}

/** The attacker's weapon odds against the defender, offered to its loadout editor inside the matchup. */
export const LoadoutOddsContext = createContext<LoadoutOdds | null>(null)
export type LoadoutOptimization = {
  key: string
  preferences: Record<string, string>
  excluded: Record<CombatPhase, string[]>
  results?: Partial<Record<LoadoutOptimizationMode, CombatResult>>
  scoring: LoadoutScoring | null
  expected: CombatRequest
  apply: (preferences: Record<string, string>) => void
}
export const LoadoutOptimizationContext = createContext<LoadoutOptimization | null>(null)

export function LoadoutOddsStatus() {
  const odds = useContext(LoadoutOddsContext)
  if (!odds?.error) return null
  return (
    <p role="alert" className="mx-2.5 mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-discarded">
      {odds.error} {odds.estimates.size || odds.profiles.size ? 'Previous odds are shown. ' : null}
      <Button size="sm" variant="outline" onClick={odds.retry}>
        Retry
      </Button>
    </p>
  )
}

/** One phase's odds in the editor's compact form: destroyed chance and average wounds lost. */
function Odds({
  phase,
  result,
  best,
  bestBy,
  prefix,
  subject,
  muted,
}: {
  phase: CombatPhase
  result: CombatResult
  best: boolean
  bestBy?: OutcomePriority
  prefix: string
  subject: string
  muted: boolean
}) {
  const destroyed = percent(result.wipe)
  const wounds = result.meanDamage.toFixed(2)
  return (
    <span
      className={`inline-flex flex-wrap items-center gap-1 ${muted ? 'text-faint' : best ? 'text-primary' : 'text-dim'}`}
      aria-label={`${PHASE_TITLES[phase]}, ${subject}: ${destroyed} destroyed, ${wounds} wounds lost on average${best ? ', best' : ''}`}
    >
      <PhaseIcon phase={phase} className="size-3" />
      {prefix}: {destroyed} · {wounds} W
      {best ? (
        <HoverTooltip
          label={`Why this is best for ${PHASE_TITLES[phase].toLowerCase()}`}
          title={bestBy ? bestLabels[bestBy] : 'Tied for best'}
          body={
            <>
              <p>{bestBy ? bestReasons[bestBy] : 'Kill chance, average models destroyed, and average wounds are tied.'}</p>
              <p className="mt-1">
                Kill chance: {Number((result.wipe * 100).toPrecision(3))}%. Models: {result.meanKills.toFixed(2)}. Wounds: {wounds}.
              </p>
            </>
          }
          className="rounded-sm bg-primary px-1 text-[0.6rem] font-semibold tracking-wide text-sunken uppercase"
        >
          {bestBy ? bestLabels[bestBy] : 'Best'}
        </HoverTooltip>
      ) : null}
    </span>
  )
}

const noteClass = 'readout mt-0.5 flex flex-wrap gap-x-3 text-2xs font-normal normal-case tracking-normal'

/** What each editor option would do against the defender, beside the option itself. */
export function useOptionNote(): OptionNote | undefined {
  const odds = useContext(LoadoutOddsContext)
  if (!odds) return undefined
  const { estimates, updating } = odds
  return function OptionEstimates(choiceKey, optionId) {
    const estimate = estimates.get(estimateKey(choiceKey, optionId))
    if (!estimate) return null
    return (
      <span className={noteClass}>
        {COMBAT_PHASES.flatMap((phase) => {
          const shown = estimate.phases[phase]
          return shown
            ? [
                <Odds
                  key={phase}
                  phase={phase}
                  result={shown.result}
                  best={shown.best}
                  bestBy={shown.bestBy}
                  prefix={estimate.step ? `Unit with 1 ${estimate.step > 0 ? 'more' : 'fewer'}` : 'Unit'}
                  subject={estimate.step ? `unit with one ${estimate.step > 0 ? 'more' : 'fewer'}` : 'unit'}
                  muted={Boolean(updating || odds.error)}
                />,
              ]
            : []
        })}
      </span>
    )
  }
}

/**
 * Each weapon profile's odds alone, under its name in the loadout editor. Among one weapon's profiles,
 * the strongest is marked so a player knows which mode to use.
 */
export function useProfileNote(prefix = ''): ((weapon: { id: string; name: string }) => ReactNode) | null {
  const odds = useContext(LoadoutOddsContext)
  if (!odds) return null
  const { profiles, updating } = odds
  return function ProfileOdds(weapon) {
    const alone = profiles.get(`${prefix}${weapon.id}`)
    if (!alone) return null
    return (
      <span className={`${noteClass} mb-0.5`}>
        <Odds
          phase={alone.phase}
          result={alone.result}
          best={alone.best}
          bestBy={alone.bestBy}
          prefix={countLabel(alone.models, 'model')}
          subject={`${countLabel(alone.models, 'model')} with this weapon`}
          muted={Boolean(updating || odds.error)}
        />
      </span>
    )
  }
}

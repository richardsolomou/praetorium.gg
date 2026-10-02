import { createContext, useContext, type ReactNode } from 'react'
import { Crosshair, Swords } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { CombatResult } from '../../../core/combat'
import type { RosterPick } from '../../../core/roster'
import type { OptionNote } from '../rosters/builder/LoadoutControls'
import { estimateKey, type LoadoutSuggestion, type Loadouts } from './loadoutSearch'

type Phase = 'ranged' | 'melee'
const titles: Record<Phase, string> = { ranged: 'Shooting', melee: 'Melee' }
const percent = (value: number) => `${(value * 100).toFixed(1)}%`

/** The attacker's loadout search, offered to its loadout editor inside the matchup. */
export const LoadoutsContext = createContext<{ loadouts: Loadouts; defender: string; onUse: (pick: RosterPick) => void } | null>(null)

function PhaseIcon({ phase }: { phase: Phase }) {
  const Icon = phase === 'ranged' ? Crosshair : Swords
  return <Icon className="size-3 shrink-0 text-info" aria-hidden />
}

/** The gain in the first measure that moves: destruction chance, then models, then wounds. */
const change = (from: CombatResult, to: CombatResult) =>
  percent(from.wipe) !== percent(to.wipe)
    ? `${percent(from.wipe)} → ${percent(to.wipe)} destroyed`
    : from.meanKills.toFixed(2) !== to.meanKills.toFixed(2)
      ? `${from.meanKills.toFixed(2)} → ${to.meanKills.toFixed(2)} models`
      : `${from.meanDamage.toFixed(2)} → ${to.meanDamage.toFixed(2)} wounds`

const gainText = (suggestion: LoadoutSuggestion) =>
  suggestion.phases.map((phase) => `${titles[phase]} ${change(suggestion.gains[phase]!.from, suggestion.gains[phase]!.to)}`).join(' · ')

/** One line in the matchup when a stronger legal loadout exists; the loadout editor holds the details. */
export function LoadoutHint({ loadouts, onOpen }: { loadouts: Loadouts | null; onOpen: () => void }) {
  if (loadouts?.status !== 'ready' || !loadouts.suggestions.length) return null
  return (
    <p aria-label="Stronger loadout" className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-dim">
      <span>
        Stronger loadout: <span className="readout text-primary">{loadouts.suggestions.map(gainText).join(' · ')}</span>
      </span>
      <Button size="xs" variant="outline" onClick={onOpen}>
        Open loadout
      </Button>
    </p>
  )
}

/** The loadout editor's heading in a matchup: the strongest legal loadout against this defender. */
export function LoadoutAdvice({ disabled }: { disabled: boolean }) {
  const advice = useContext(LoadoutsContext)
  if (!advice) return null
  const { loadouts, defender, onUse } = advice
  // A stale suggestion would undo the edit being searched, so it waits.
  const updating = loadouts.status === 'searching' || (loadouts.status === 'ready' && Boolean(loadouts.updating))
  return (
    <section
      aria-label="Best loadout"
      aria-busy={updating}
      className={`shrink-0 border-b border-edge p-3 text-xs ${updating && loadouts.status === 'ready' ? 'opacity-60' : ''}`}
    >
      <p className="text-dim">Against {defender}</p>
      {loadouts.status === 'searching' ? <p className="mt-1 text-dim">Comparing loadouts…</p> : null}
      {loadouts.status === 'failed' ? (
        <p role="alert" className="mt-1 text-discarded">
          Loadouts could not be compared.{' '}
          <Button size="xs" variant="outline" onClick={loadouts.retry}>
            Retry
          </Button>
        </p>
      ) : null}
      {loadouts.status === 'ready' && loadouts.choices && !loadouts.suggestions.length ? (
        <p className="mt-1 text-bone">
          {loadouts.complete ? 'No loadout is meaningfully stronger.' : 'No meaningfully stronger loadout found.'}
        </p>
      ) : null}
      {loadouts.status === 'ready'
        ? loadouts.suggestions.map((suggestion) => (
            <div key={suggestion.phases.join()} className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-bone">{suggestion.changes.join(', ')}</span>
                <span className="readout text-primary">{gainText(suggestion)}</span>
                {suggestion.points ? (
                  <span className="readout ml-2 text-info">
                    {suggestion.points > 0 ? '+' : '−'}
                    {Math.abs(suggestion.points)} pts
                  </span>
                ) : null}
              </span>
              <Button size="sm" variant="outline" disabled={disabled || updating} onClick={() => onUse(suggestion.pick)}>
                {suggestion.phases.length > 1 ? 'Use best loadout' : `Use best for ${titles[suggestion.phases[0]!].toLowerCase()}`}
              </Button>
            </div>
          ))
        : null}
    </section>
  )
}

/** One phase's odds in the editor's compact form: destroyed chance and average wounds lost. */
function Odds({
  phase,
  result,
  best,
  prefix,
  subject,
  muted,
}: {
  phase: Phase
  result: CombatResult
  best: boolean
  prefix: string
  subject: string
  muted: boolean
}) {
  const destroyed = percent(result.wipe)
  const wounds = result.meanDamage.toFixed(2)
  return (
    <span
      className={`inline-flex items-center gap-1 ${muted ? 'text-faint' : best ? 'text-primary' : 'text-dim'}`}
      aria-label={`${titles[phase]}, ${subject}: ${destroyed} destroyed, ${wounds} wounds lost on average${best ? ', best' : ''}`}
    >
      <PhaseIcon phase={phase} />
      {prefix}: {destroyed} · {wounds} W
      {best ? (
        <span className="rounded-sm bg-primary px-1 text-[0.6rem] font-semibold tracking-wide text-sunken uppercase">Best</span>
      ) : null}
    </span>
  )
}

const noteClass = 'readout mt-0.5 flex flex-wrap gap-x-3 text-2xs font-normal normal-case tracking-normal'

/** What each editor option would do against the defender, beside the option itself. */
export function useOptionNote(): OptionNote | undefined {
  const advice = useContext(LoadoutsContext)
  if (advice?.loadouts.status !== 'ready') return undefined
  const { estimates, updating } = advice.loadouts
  return function OptionEstimates(choiceKey, optionId) {
    const estimate = estimates.get(estimateKey(choiceKey, optionId))
    if (!estimate) return null
    return (
      <span className={noteClass}>
        {(['ranged', 'melee'] as const).flatMap((phase) => {
          const shown = estimate.phases[phase]
          return shown
            ? [
                <Odds
                  key={phase}
                  phase={phase}
                  result={shown.result}
                  best={shown.best}
                  prefix={estimate.step ? `Unit, ${estimate.step > 0 ? '+1' : '−1'}` : 'Unit'}
                  subject={estimate.step ? `unit with one ${estimate.step > 0 ? 'more' : 'fewer'}` : 'unit'}
                  muted={Boolean(updating)}
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
export function useProfileNote(): ((weapon: { id: string; name: string }) => ReactNode) | null {
  const advice = useContext(LoadoutsContext)
  if (advice?.loadouts.status !== 'ready') return null
  const { profiles, updating } = advice.loadouts
  return function ProfileOdds(weapon) {
    const odds = profiles.get(weapon.id)
    if (!odds) return null
    return (
      <span className={`${noteClass} mb-0.5`}>
        <Odds
          phase={odds.phase}
          result={odds.result}
          best={odds.best}
          prefix={odds.each ? '1 weapon alone' : 'Alone'}
          subject={odds.each ? 'one weapon alone' : 'alone'}
          muted={Boolean(updating)}
        />
      </span>
    )
  }
}

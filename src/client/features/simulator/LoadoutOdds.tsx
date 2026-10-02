import { createContext, useContext, type ReactNode } from 'react'
import { Crosshair, Swords } from 'lucide-react'
import type { CombatResult } from '../../../core/combat'
import { estimateKey } from '../../../core/combatLoadouts'
import type { OptionNote } from '../rosters/builder/LoadoutControls'
import type { LoadoutOdds } from './useLoadoutOdds'

type Phase = 'ranged' | 'melee'
const titles: Record<Phase, string> = { ranged: 'Shooting', melee: 'Melee' }
const percent = (value: number) => `${(value * 100).toFixed(1)}%`

/** The attacker's weapon odds against the defender, offered to its loadout editor inside the matchup. */
export const LoadoutOddsContext = createContext<LoadoutOdds | null>(null)

function PhaseIcon({ phase }: { phase: Phase }) {
  const Icon = phase === 'ranged' ? Crosshair : Swords
  return <Icon className="size-3 shrink-0 text-info" aria-hidden />
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
  const odds = useContext(LoadoutOddsContext)
  if (!odds) return undefined
  const { estimates, updating } = odds
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
                  prefix={estimate.step ? `Unit with 1 ${estimate.step > 0 ? 'more' : 'fewer'}` : 'Unit'}
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
  const odds = useContext(LoadoutOddsContext)
  if (!odds) return null
  const { profiles, updating } = odds
  return function ProfileOdds(weapon) {
    const alone = profiles.get(weapon.id)
    if (!alone) return null
    return (
      <span className={`${noteClass} mb-0.5`}>
        <Odds
          phase={alone.phase}
          result={alone.result}
          best={alone.best}
          prefix={`${alone.models} ${alone.models === 1 ? 'model' : 'models'}`}
          subject={`${alone.models} ${alone.models === 1 ? 'model' : 'models'} with this weapon`}
          muted={Boolean(updating)}
        />
      </span>
    )
  }
}

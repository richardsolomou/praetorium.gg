import type { CombatPhase } from '../../../core/combat'
import type { CombatantSnapshot, CombatRequest } from '../../../core/combatMatchup'
import { calculationInputs } from './calculationInputs'
import { phases, type CombatMatchupView, type MatchupModifiers } from './matchupModifiers'
import { weaponToggleGroups } from './PhaseWeapons'

/** What each phase's calculation uses: profile changes, unit inputs, sourced re-rolls and manual modifiers. */
export function AppliedModifiers({
  attacker,
  defender,
  plans,
  excludedWeapons,
  scenarios,
  phaseSummary,
}: {
  attacker: CombatantSnapshot | null
  defender: CombatantSnapshot | null
  plans: CombatMatchupView['plans']
  excludedWeapons: Record<CombatPhase, string[]>
  scenarios: CombatRequest
  phaseSummary: MatchupModifiers['phaseSummary']
}) {
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
  )
}

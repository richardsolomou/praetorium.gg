import type { CombatantSnapshot } from '../../../core/combatMatchup'
import type { CombatWeaponChoice } from '../../../core/combatProfiles'
import type { CombatPhase } from '../../../core/combat'

/** What a phase estimate takes into account besides manual modifiers: both sides' active rules, the weapon choices made, and the weapons left out. */
export function calculationInputs(
  phase: CombatPhase,
  {
    attacker,
    defender,
    choices,
    excluded,
  }: {
    attacker: CombatantSnapshot | null
    defender: CombatantSnapshot | null
    choices: readonly CombatWeaponChoice[]
    excluded: readonly string[]
  },
) {
  const rulesOf = (unit: CombatantSnapshot | null) => [
    ...new Set(
      [unit, ...(unit?.companions ?? [])].flatMap((member) =>
        (member?.rules ?? []).filter((rule) => rule.effects.some((effect) => effect.phases.includes(phase))).map((rule) => rule.name),
      ),
    ),
  ]
  const attacking = rulesOf(attacker)
  const defending = rulesOf(defender)
  const modes = choices.flatMap((choice) => {
    const option = choice.options.length > 1 ? choice.options.find((candidate) => candidate.value === choice.value) : undefined
    return option ? [`${choice.label}: ${option.label.replace(/^➤\s*/, '')}`] : []
  })
  return [
    attacking.length ? `Attacker rules: ${attacking.join(', ')}` : 'No attacker rules',
    defending.length ? `Defender rules: ${defending.join(', ')}` : 'No defender rules',
    ...(modes.length ? [`Weapon choices: ${modes.join(', ')}`] : []),
    ...(excluded.length ? [`Left out: ${excluded.join(', ')}`] : []),
  ]
}

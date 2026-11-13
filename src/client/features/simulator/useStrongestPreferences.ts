import { useEffect, useMemo, useState } from 'react'
import type { CombatPhase } from '../../../core/combat'
import type { CombatAdjustments } from '../../../core/combatAdjustments'
import { strongestWeaponPreferences, type CombatantSnapshot } from '../../../core/combatMatchup'
import { combatCalculator } from './combatCalculation'

/** Weapon choices the player left open take the option that does most against this defender; only their own picks are saved. */
export function useStrongestPreferences({
  attacker,
  defender,
  preferences,
  excludedWeapons,
  allocation,
  adjustments,
  retry,
  pending,
  failed,
}: {
  attacker: CombatantSnapshot | null
  defender: CombatantSnapshot | null
  preferences: Record<string, string>
  excludedWeapons: Record<CombatPhase, string[]>
  allocation: readonly string[]
  adjustments: CombatAdjustments
  retry: number
  pending: boolean
  failed: boolean
}) {
  const [strongest, setStrongest] = useState<{ key: string; preferences: Record<string, string> } | null>(null)
  const strongestKey = useMemo(
    () => JSON.stringify([attacker, defender, preferences, excludedWeapons, allocation, adjustments, retry]),
    [attacker, defender, preferences, excludedWeapons, allocation, adjustments, retry],
  )
  const choosing = !pending && !failed && Boolean(attacker && defender) && strongest?.key !== strongestKey
  useEffect(() => {
    if (pending || failed || !attacker || !defender) return
    const controller = new AbortController()
    const calculator = combatCalculator()
    const settle = (found: Record<string, string>) => {
      if (!controller.signal.aborted) setStrongest({ key: strongestKey, preferences: found })
    }
    void strongestWeaponPreferences(attacker, defender, { preferences, excluded: excludedWeapons, allocation }, adjustments, (requests) =>
      calculator.calculate(requests, controller.signal),
    )
      .then(settle, () => settle(preferences))
      .finally(() => calculator.dispose())
    return () => controller.abort()
    // strongestKey stands for every input the search reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strongestKey, pending, failed])
  const chosen = strongest?.key === strongestKey ? strongest.preferences : preferences
  return { chosen, choosing }
}

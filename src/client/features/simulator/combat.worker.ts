import { calculateCombat, type CombatInput } from '../../../core/combat'
import { loadoutOdds } from '../../../core/combatLoadouts'
import type { CombatAnswer, CombatRequest } from './CombatMatchup'
import type { LoadoutOdds, LoadoutOddsRequest } from './useLoadoutOdds'

function run(input: CombatInput | null) {
  if (!input) return null
  try {
    return { result: calculateCombat(input) }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'The simulation failed.' }
  }
}

self.onmessage = (event: MessageEvent<CombatRequest | LoadoutOddsRequest>) => {
  const { data } = event
  if ('kind' in data) self.postMessage(loadoutOdds(data.space, data.scoring, data.expected) satisfies LoadoutOdds)
  else self.postMessage({ ranged: run(data.ranged), melee: run(data.melee) } satisfies CombatAnswer)
}

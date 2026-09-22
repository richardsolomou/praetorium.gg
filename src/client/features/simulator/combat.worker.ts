import { simulateCombat, type CombatInput } from '../../../core/combat'
import type { CombatAnswer, CombatRequest } from './CombatMatchup'

function run(input: CombatInput | null) {
  if (!input) return null
  try {
    return { result: simulateCombat(input) }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'The simulation failed.' }
  }
}

self.onmessage = (event: MessageEvent<CombatRequest>) => {
  self.postMessage({ ranged: run(event.data.ranged), melee: run(event.data.melee) } satisfies CombatAnswer)
}

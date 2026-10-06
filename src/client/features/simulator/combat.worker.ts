import { calculateCombat, calculateCombatSequence, type CombatInput } from '../../../core/combat'
import { loadoutOdds, optimizeLoadout } from '../../../core/combatLoadouts'
import type { CombatAnswer, CombatRequest } from './CombatMatchup'
import type { LoadoutOdds, LoadoutOddsRequest } from './useLoadoutOdds'
import type { OptimizeLoadoutRequest, OptimizeLoadoutAnswer } from './useLoadoutOptimizer'

function run(input: CombatInput | null) {
  if (!input) return null
  try {
    return { result: calculateCombat(input) }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'The simulation failed.' }
  }
}

self.onmessage = (event: MessageEvent<CombatRequest | LoadoutOddsRequest | OptimizeLoadoutRequest>) => {
  const { data } = event
  if ('kind' in data && data.kind === 'optimize') {
    try {
      self.postMessage({ optimized: optimizeLoadout(data.space, data.scoring) } satisfies OptimizeLoadoutAnswer)
    } catch (error) {
      self.postMessage({ error: error instanceof Error ? error.message : 'Optimization failed.' } satisfies OptimizeLoadoutAnswer)
    }
  } else if ('kind' in data) self.postMessage(loadoutOdds(data.space, data.scoring, data.expected) satisfies LoadoutOdds)
  else {
    const answer: CombatAnswer = { ranged: run(data.ranged), melee: run(data.melee) }
    if (data.ranged && data.melee && answer.ranged?.result && answer.melee?.result) {
      try {
        if (data.sequenceError) throw new Error(data.sequenceError)
        answer.combined = { result: calculateCombatSequence([data.ranged, data.melee]) }
      } catch (error) {
        answer.combined = { error: error instanceof Error ? error.message : 'The simulation failed.' }
      }
    }
    self.postMessage(answer)
  }
}

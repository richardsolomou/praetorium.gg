import { loadoutOdds, optimizeLoadout } from '../../../core/combatLoadouts'
import { resolveCombatRequest, type CombatRequest } from '../../../core/combatMatchup'
import type { LoadoutOdds, LoadoutOddsRequest } from './useLoadoutOdds'
import type { OptimizeLoadoutRequest, OptimizeLoadoutAnswer } from './useLoadoutOptimizer'

self.onmessage = (event: MessageEvent<CombatRequest | LoadoutOddsRequest | OptimizeLoadoutRequest>) => {
  const { data } = event
  if ('kind' in data && data.kind === 'optimize') {
    try {
      self.postMessage({ optimized: optimizeLoadout(data.space, data.scoring) } satisfies OptimizeLoadoutAnswer)
    } catch (error) {
      self.postMessage({ error: error instanceof Error ? error.message : 'Optimization failed.' } satisfies OptimizeLoadoutAnswer)
    }
  } else if ('kind' in data) self.postMessage(loadoutOdds(data.space, data.scoring, data.expected) satisfies LoadoutOdds)
  else self.postMessage(resolveCombatRequest(data))
}

import { parentPort } from 'node:worker_threads'
import { optimizeLoadout } from '../core/combatLoadouts'
import { resolveCombatRequest, type CombatRequest } from '../core/combatMatchup'
import type { OptimizeLoadoutMessage } from './combatCalculationPool'

parentPort!.on('message', (message: CombatRequest | OptimizeLoadoutMessage) => {
  if (!('kind' in message)) return parentPort!.postMessage(resolveCombatRequest(message))
  try {
    parentPort!.postMessage({ optimized: optimizeLoadout(message.space, message.scoring, message.mode, message.maxWork) })
  } catch (error) {
    parentPort!.postMessage({ error: error instanceof Error ? error.message : String(error) })
  }
})

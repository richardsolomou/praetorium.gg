import { parentPort } from 'node:worker_threads'
import { resolveCombatRequest, type CombatRequest } from '../core/combatMatchup'

parentPort!.on('message', (request: CombatRequest) => parentPort!.postMessage(resolveCombatRequest(request)))

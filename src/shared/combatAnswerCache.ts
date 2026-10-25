import { BoundedCache } from './boundedCache'
import type { CombatAnswer, CombatRequest } from '../core/combatMatchup'

export class CombatAnswerCache extends BoundedCache<CombatRequest, CombatAnswer> {
  constructor(maxBytes: number, maxEntries = 2048) {
    super(maxBytes, maxEntries, (request) => JSON.stringify(request))
  }

  override write(request: CombatRequest, answer: CombatAnswer) {
    if ([answer.ranged, answer.melee, answer.combined].some((phase) => phase?.error)) return
    super.write(request, answer)
  }
}

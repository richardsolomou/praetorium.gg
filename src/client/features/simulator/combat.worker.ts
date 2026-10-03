import { calculateCombat, calculateCombatSequence, type CombatInput } from '../../../core/combat'
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
  else {
    const answer: CombatAnswer = { ranged: run(data.ranged), melee: run(data.melee) }
    if (data.ranged && data.melee && answer.ranged?.result && answer.melee?.result) {
      try {
        answer.combined = { result: calculateCombatSequence([data.ranged, data.melee]) }
      } catch (error) {
        answer.combined = { error: error instanceof Error ? error.message : 'The simulation failed.' }
      }
    }
    self.postMessage(answer)
  }
}

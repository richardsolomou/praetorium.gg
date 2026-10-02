import { calculateCombat, type CombatInput } from '../../../core/combat'
import { loadoutExplorer, loadoutScorer } from '../../../core/combatLoadouts'
import type { CombatAnswer, CombatRequest } from './CombatMatchup'
import type { LoadoutAnswer, LoadoutMessage } from './loadoutSearch'

function run(input: CombatInput | null) {
  if (!input) return null
  try {
    return { result: calculateCombat(input) }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'The simulation failed.' }
  }
}

let session: { scorer: ReturnType<typeof loadoutScorer>; explorer: ReturnType<typeof loadoutExplorer> } | null = null

function loadouts(message: LoadoutMessage): LoadoutAnswer {
  if (message.kind === 'search') {
    const { space, scoring, expected } = message
    const scorer = loadoutScorer(space, scoring)
    // A search that cannot reproduce the matchup's own attack would compare against a different unit.
    const current = scorer.inputs(space.carriers)
    const comparable = {
      ranged: JSON.stringify(current.ranged) === JSON.stringify(expected.ranged),
      melee: JSON.stringify(current.melee) === JSON.stringify(expected.melee),
    }
    const explorer = loadoutExplorer(space, (carriers) => {
      const score = scorer.score(carriers)
      return { ranged: comparable.ranged ? score.ranged : null, melee: comparable.melee ? score.melee : null }
    })
    session = { scorer, explorer }
    return { kind: 'searched', search: explorer.search(message.keep), current: explorer.current, comparable }
  }
  if (!session) throw new Error('No loadout search is open.')
  return { kind: 'scored', scores: message.carriers.map((carriers) => session!.scorer.score(carriers)) }
}

self.onmessage = (event: MessageEvent<CombatRequest | LoadoutMessage>) => {
  const { data } = event
  if ('kind' in data) self.postMessage(loadouts(data))
  else self.postMessage({ ranged: run(data.ranged), melee: run(data.melee) } satisfies CombatAnswer)
}

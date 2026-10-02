import { calculateCombat, type CombatInput } from '../../../core/combat'
import { loadoutExplorer, loadoutProfileOdds, loadoutScorer } from '../../../core/combatLoadouts'
import type { CombatAnswer, CombatRequest, CombatWeaponRequest } from './CombatMatchup'
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
    return {
      kind: 'searched',
      search: explorer.search(message.keep),
      current: explorer.current,
      comparable,
      profiles: [...loadoutProfileOdds(space, scoring)],
    }
  }
  if (!session) throw new Error('No loadout search is open.')
  if (message.kind === 'rows') return { kind: 'rows', rows: session.explorer.rows(message.base) }
  return { kind: 'scored', scores: message.carriers.map((carriers) => session!.scorer.score(carriers)) }
}

/** A weapon's own odds are a supplement: one it cannot calculate is left out rather than failing the estimate. */
const alone = (requests: CombatWeaponRequest[keyof CombatWeaponRequest]) =>
  Object.fromEntries(
    requests.flatMap(({ id, input }) => {
      const answer = run(input)
      return answer?.result ? [[id, answer.result]] : []
    }),
  )

self.onmessage = (event: MessageEvent<(CombatRequest & { weapons: CombatWeaponRequest }) | LoadoutMessage>) => {
  const { data } = event
  if ('kind' in data) self.postMessage(loadouts(data))
  else
    self.postMessage({
      ranged: run(data.ranged),
      melee: run(data.melee),
      weapons: { ranged: alone(data.weapons.ranged), melee: alone(data.weapons.melee) },
    } satisfies CombatAnswer)
}

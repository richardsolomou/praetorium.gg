import { combatLoadoutCandidates } from '../../shared/combatLoadouts'
import { combatLoadoutSchema } from '../../contracts/schemas'
import { buildConstruction } from './construction'
import type { CombatDiscoveryRequest, CombatDiscoveryAnswer } from './combatDiscovery'

let batches: ReturnType<typeof combatLoadoutCandidates> | undefined
self.onmessage = async (event: MessageEvent<CombatDiscoveryRequest>) => {
  try {
    if (event.data.kind === 'start') {
      const local = buildConstruction(event.data.construction)
      batches = combatLoadoutCandidates(
        local.catalogue,
        combatLoadoutSchema.parse(event.data.input),
        new AbortController().signal,
        local.rules,
      )
    }
    if (!batches) throw new Error('The loadout search has not started.')
    const next = await batches.next()
    self.postMessage((next.done ? { done: true } : { batch: next.value }) satisfies CombatDiscoveryAnswer)
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'Optimization failed.' } satisfies CombatDiscoveryAnswer)
  }
}

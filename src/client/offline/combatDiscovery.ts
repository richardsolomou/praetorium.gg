import type { OfflineConstructionData } from '../../contracts/offlineReference'
import type { LoadoutBatch } from '../../core/combatLoadouts'

export type CombatDiscoveryRequest = { kind: 'start'; construction: OfflineConstructionData; input: unknown } | { kind: 'next' }
export type CombatDiscoveryAnswer = { batch: LoadoutBatch } | { done: true } | { error: string }

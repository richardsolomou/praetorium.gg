import type { z } from 'zod'
import type { createBattleSchema, createSealedEventSchema } from '../contracts/schemas'
import { AsyncLocalStorage } from 'node:async_hooks'
import { globalSingleton } from 'ras-stack/server'
import { app } from './app'
import { offlineContext } from './offlineContext'

/** Set while an account agent tool runs, so its writes are told apart from the app's. */
export const agentWrites = globalSingleton('praetorium.agent-writes', () => new AsyncLocalStorage<true>())

export function captureWrite(userId: string, event: string, delivery: 'sync' | 'direct', properties?: Record<string, unknown>) {
  return app().telemetry.capture(userId, event, { ...properties, delivery, ...(agentWrites.getStore() ? { via: 'agent' } : {}) })
}

export function captureMutation(userId: string, event: string, properties?: Record<string, unknown>) {
  const sync = offlineContext.getStore()
  if (sync && !sync.applied) return
  return captureWrite(userId, event, sync ? 'sync' : 'direct', properties)
}

export function captureBattleCreated(
  userId: string,
  data: z.output<typeof createBattleSchema>,
  result: { battleId: string; practice: boolean },
) {
  return captureMutation(userId, 'battle_created', {
    battle_id: result.battleId,
    practice: result.practice,
    limit: data.limit,
    player_count: 1 + (data.allyId ? 1 : 0) + (data.opponentIds?.length ?? (data.opponentId ? 1 : 0)) + (data.guestNames?.length ?? 0),
    casual: data.casual,
    manual: data.manual,
    guests: data.guestNames?.length ?? 0,
  })
}

export function captureSealedEventCreated(userId: string, data: z.output<typeof createSealedEventSchema>) {
  return captureMutation(userId, 'tournament_created', {
    visibility: data.visibility,
    admission: data.admission,
    format: data.format,
    roster_limit: data.rosterLimit,
    owner_plays: data.ownerPlays,
  })
}

export function captureSealedEventBattleCreated(
  userId: string,
  result: { battleId: string; format: string | null; requiredLimit: number },
) {
  return captureMutation(userId, 'sealed_event_battle_created', {
    battle_id: result.battleId,
    format: result.format,
    required_limit: result.requiredLimit,
  })
}

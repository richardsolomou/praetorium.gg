import type { z } from 'zod'
import type { createBattleSchema, createLeagueSchema } from '../contracts/schemas'
import { app } from './app'
import { offlineContext } from './offlineContext'

export function captureMutation(userId: string, event: string, properties?: Record<string, unknown>) {
  const sync = offlineContext.getStore()
  if (sync && !sync.applied) return
  return app().telemetry.capture(userId, event, { ...properties, delivery: sync ? 'sync' : 'direct' })
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

export function captureLeagueCreated(userId: string, data: z.output<typeof createLeagueSchema>) {
  return captureMutation(userId, 'league_created', {
    visibility: data.visibility,
    admission: data.admission,
    format: data.format,
    roster_limit: data.rosterLimit,
    owner_plays: data.ownerPlays,
  })
}

export function captureLeagueBattleCreated(userId: string, result: { format: string | null; requiredLimit: number }) {
  return captureMutation(userId, 'league_battle_created', { format: result.format, required_limit: result.requiredLimit })
}

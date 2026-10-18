import type { z } from 'zod'
import type { createBattleSchema, createLeagueSchema } from '../contracts/schemas'
import { app } from './app'
import { offlineContext } from './offlineContext'

function capture(userId: string, event: string, properties: Record<string, unknown>) {
  const sync = offlineContext.getStore()
  if (sync && !sync.applied) return
  return app().telemetry.capture(userId, event, properties)
}

export function captureBattleCreated(userId: string, data: z.output<typeof createBattleSchema>, result: { practice: boolean }) {
  return capture(userId, 'battle_created', {
    practice: result.practice,
    limit: data.limit,
    player_count: 1 + (data.allyId ? 1 : 0) + (data.opponentIds?.length ?? (data.opponentId ? 1 : 0)),
    casual: data.casual,
    manual: data.manual,
  })
}

export function captureLeagueCreated(userId: string, data: z.output<typeof createLeagueSchema>) {
  return capture(userId, 'league_created', {
    visibility: data.visibility,
    admission: data.admission,
    format: data.format,
    roster_limit: data.rosterLimit,
    owner_plays: data.ownerPlays,
  })
}

export function captureLeagueBattleCreated(userId: string, result: { format: string | null; requiredLimit: number }) {
  return capture(userId, 'league_battle_created', { format: result.format, required_limit: result.requiredLimit })
}

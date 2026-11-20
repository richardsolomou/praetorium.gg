import type { z } from 'zod'
import type { createBattleSchema, createSealedEventSchema } from '../contracts/schemas'
import { AsyncLocalStorage } from 'node:async_hooks'
import { globalSingleton } from '../lib/globalSingleton'
import { app } from './app'
import { offlineContext } from './offlineContext'

/** Set while an account agent tool runs, so its writes are told apart from the app's. */
export const agentWrites = globalSingleton('praetorium.agent-writes', () => new AsyncLocalStorage<true>())

export function captureWrite(userId: string, event: string, delivery: 'sync' | 'direct', properties?: Record<string, unknown>) {
  return app().telemetry.posthog.capture({
    distinctId: userId,
    event: event,
    properties: { ...properties, delivery, ...(agentWrites.getStore() ? { via: 'agent' } : {}) },
  })
}

export function captureMutation(userId: string, event: string, properties?: Record<string, unknown>) {
  const sync = offlineContext.getStore()
  if (sync && !sync.applied) return
  return captureWrite(userId, event, sync ? 'sync' : 'direct', properties)
}

export function captureBattleCreated(userId: string, data: z.output<typeof createBattleSchema>, result: { battleId: string }) {
  return captureMutation(userId, 'battle_created', {
    battle_id: result.battleId,
    limit: data.limit,
    player_count: 1 + (data.allyId ? 1 : 0) + (data.opponentIds?.length ?? (data.opponentId ? 1 : 0)),
    casual: data.casual,
    manual: data.manual,
  })
}

/** Starts a draft, or hands back the creator's untouched one; only a new draft is counted. */
export async function startDraftBattle(userId: string, missionPackId: string | null) {
  const result = await app().service.startDraft(userId, missionPackId)
  if (!result.reused) captureMutation(userId, 'battle_draft_started', { battle_id: result.battleId })
  return result
}

/** Makes the link that fills a battle's open places, which a QR code can pass on without a share being recorded. */
export async function shareBattleLink(userId: string, token: string) {
  const { battleId, invite } = await app().service.shareBattle(token, userId)
  captureMutation(userId, 'battle_link_created', { battle_id: battleId })
  return { invite }
}

export async function inviteFriendToBattle(userId: string, token: string, friendId: string) {
  const { battleId, invite } = await app().service.inviteToBattle(token, userId, friendId)
  captureMutation(userId, 'battle_friend_invited', { battle_id: battleId })
  return { invite }
}

export async function joinInvitedBattle(userId: string, invite: string, side: 0 | 1) {
  const result = await app().service.joinBattle(invite, userId, side)
  if (result.joined) captureMutation(userId, 'battle_joined', { battle_id: result.battleId })
  return { token: result.token }
}

export async function stopSharingBattleLink(userId: string, token: string) {
  const { battleId } = await app().service.stopSharingBattle(token, userId)
  captureMutation(userId, 'battle_link_stopped', { battle_id: battleId })
  return null
}

/** Removes a player before the battle starts; `practice` is a place the creator played themselves and gave back. */
export async function removePlayerFromBattle(userId: string, token: string, playerId: string) {
  const { battleId, practice } = await app().service.removeBattlePlayer(token, userId, playerId)
  captureMutation(userId, 'battle_player_removed', { battle_id: battleId, practice })
  return null
}

/** Marks an entrant arrived, or not; `self` tells a player's own check-in from the organizer's. */
export async function checkInSealedEventEntrant(userId: string, token: string, eventToken: string, entrantId: string, checkedIn: boolean) {
  await app().service.sealedEventService.checkIn(token, eventToken, userId, entrantId, checkedIn)
  captureMutation(userId, 'sealed_event_entrant_checked_in', { checked_in: checkedIn, self: entrantId === userId })
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

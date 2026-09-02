import { createServerFn } from '@tanstack/react-start'
import type { Command } from '../../core/battle'
import { app } from '../app'
import { factionIndexFor } from '../factionReferences'
import { currentUserId, requireUser, requireUserId } from '../playerSession'
import { rosterForUse } from '../rosterUsage'
import { mutationRpc, rpc } from '../rpc'
import {
  battlesPageSchema,
  createBattleSchema,
  deleteBattleSchema,
  leagueBattleOptionsSchema,
  submitSchema,
  tokenSchema,
  userSchema,
} from '../schemas'

async function orNull<T>(work: () => Promise<T>) {
  try {
    return await work()
  } catch (error) {
    if (error instanceof Response && error.status === 404) return null
    throw error
  }
}

function battleLifecycleEvent(kind: string) {
  if (kind === 'attach-roster') return 'battle_roster_attached'
  if (kind === 'begin-battle') return 'battle_started'
  if (kind === 'end-battle') return 'battle_finished'
  if (kind === 'reopen-battle') return 'battle_reopened'
  return null
}

/** A page of the battle list. History grows for an account's lifetime; a page does not. */
const BATTLES_PAGE = 25

/** A page of a home-page feed. Shorter, because the page shows three of them at once. */
const FEED_PAGE = 10

function battleFactions() {
  const catalogue = app().catalogue()
  return catalogue ? factionIndexFor(catalogue, app().rules()).factions : []
}

export const myBattles = createServerFn({ method: 'GET' })
  .validator(battlesPageSchema)
  .handler(({ data }) =>
    rpc(async () => {
      const id = await currentUserId()
      if (!id) return { battles: [], nextCursor: null }
      return app().service.battles(id, app().rules(), { limit: BATTLES_PAGE, before: data.before ?? undefined }, battleFactions())
    }),
  )

/**
 * The battles anyone may watch, most recently started first.
 *
 * Signed out as well as signed in: this is what the home page shows a visitor who
 * has never played, so it must answer without an account. The viewer, when there
 * is one, only narrows it — their own games are already above it on that page.
 */
export const publicBattles = createServerFn({ method: 'GET' })
  .validator(battlesPageSchema)
  .handler(({ data }) =>
    rpc(async () => {
      const viewerId = await currentUserId()
      return app().service.publicBattles(viewerId, app().rules(), { limit: FEED_PAGE, before: data.before ?? undefined }, battleFactions())
    }),
  )

/** The battles this player's friends are in and they are not. */
export const friendBattles = createServerFn({ method: 'GET' })
  .validator(battlesPageSchema)
  .handler(({ data }) =>
    rpc(async () => {
      const id = await currentUserId()
      if (!id) return { battles: [], nextCursor: null }
      return app().service.friendBattles(id, app().rules(), { limit: FEED_PAGE, before: data.before ?? undefined }, battleFactions())
    }),
  )

/** The most recently active battles the viewer shares with one other player. */
export const sharedBattles = createServerFn({ method: 'GET' })
  .validator(userSchema)
  .handler(({ data }) =>
    rpc(async () => {
      const id = await currentUserId()
      if (!id) return []
      const { battles } = await app().service.battles(id, app().rules(), { limit: BATTLES_PAGE, withUserId: data.userId }, battleFactions())
      return battles
    }),
  )

export const openBattle = createServerFn({ method: 'GET' })
  .validator(tokenSchema)
  .handler(({ data }) =>
    rpc(async () => {
      const userId = await currentUserId()
      return orNull(() => app().service.screen(data.token, userId, app().rules()))
    }),
  )

export const leagueBattleOptions = createServerFn({ method: 'GET' })
  .validator(leagueBattleOptionsSchema)
  .handler(({ data }) =>
    rpc(async () => {
      const player = await requireUser()
      return app().service.leagueBattleOptions(player.id, data)
    }),
  )

export const createBattle = createServerFn({ method: 'POST' })
  .validator(createBattleSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      const result = await app().service.createBattle(player.id, data)
      await app().telemetry.capture(player.id, 'battle_created', { practice: result.practice, limit: data.limit })
      return result
    }),
  )

export const deleteBattle = createServerFn({ method: 'POST' })
  .validator(deleteBattleSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      await app().service.deleteBattle(data.token, player.id)
      await app().telemetry.capture(player.id, 'battle_deleted')
      return null
    }),
  )

export const submit = createServerFn({ method: 'POST' })
  .validator(submitSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      const startedAt = performance.now()
      const submitted = data.command
      let command: Command
      if (submitted.kind === 'attach-saved-roster') {
        const { snapshot } = await rosterForUse(player.id, submitted.rosterId)
        command = {
          kind: 'attach-roster',
          roster: snapshot,
          prep: null,
          painted: true,
          ...(submitted.playerId ? { playerId: submitted.playerId } : {}),
        }
      } else if (submitted.kind === 'attach-roster' && submitted.roster.built) {
        if (!submitted.roster.id) throw new Response('choose a saved roster', { status: 400 })
        command = { ...submitted, roster: (await rosterForUse(player.id, submitted.roster.id)).snapshot }
      } else {
        command = submitted
      }
      const result = await app().service.submit(data.token, player.id, data.expectedSeq, command, app().rules())
      await app().telemetry.capture(player.id, 'battle_command_submitted', {
        command: command.kind,
        outcome: result.result.outcome,
        duration_ms: Math.round(performance.now() - startedAt),
      })
      if (result.result.outcome === 'appended') {
        const lifecycleEvent = battleLifecycleEvent(command.kind)
        if (lifecycleEvent) await app().telemetry.capture(player.id, lifecycleEvent)
      }
      return result
    }),
  )

export const battleReport = createServerFn({ method: 'GET' })
  .validator(tokenSchema)
  .handler(({ data }) => rpc(async () => app().service.report(data.token, await requireUserId(), app().rules())))

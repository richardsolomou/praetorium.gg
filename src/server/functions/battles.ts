import { createServerFn } from '@tanstack/react-start'
import { app } from '../app'
import { currentUserId, requireUser, requireUserId } from '../playerSession'
import { mutationRpc, rpc } from '../rpc'
import { createBattleSchema, deleteBattleSchema, submitSchema, tokenSchema } from '../schemas'

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

export const myBattles = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => {
    const id = await currentUserId()
    return id ? app().service.battles(id, app().rules()) : []
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

export const joinBattle = createServerFn({ method: 'POST' })
  .validator(tokenSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      const result = await app().service.join(data.token, player.id)
      await app().telemetry.capture(player.id, 'battle_joined')
      return result
    }),
  )

export const submit = createServerFn({ method: 'POST' })
  .validator(submitSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      const startedAt = performance.now()
      const result = await app().service.submit(data.token, player.id, data.expectedSeq, data.command, app().rules())
      await app().telemetry.capture(player.id, 'battle_command_submitted', {
        command: data.command.kind,
        outcome: result.result.outcome,
        duration_ms: Math.round(performance.now() - startedAt),
      })
      if (result.result.outcome === 'appended') {
        const lifecycleEvent = battleLifecycleEvent(data.command.kind)
        if (lifecycleEvent) await app().telemetry.capture(player.id, lifecycleEvent)
      }
      return result
    }),
  )

export const battleReport = createServerFn({ method: 'GET' })
  .validator(tokenSchema)
  .handler(({ data }) => rpc(async () => app().service.report(data.token, await requireUserId())))

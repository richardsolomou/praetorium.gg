import { createServerFn } from '@tanstack/react-start'
import { app } from '../app'
import { currentUserId, requireUserId } from '../playerSession'
import { mutationRpc, rpc } from '../rpc'
import { createEventSchema, eventIdSchema, selectEventRosterSchema } from '../schemas'

export const myEvents = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => {
    const userId = await currentUserId()
    return userId ? app().service.eventList(userId) : []
  }),
)

export const openEvent = createServerFn({ method: 'GET' })
  .validator(eventIdSchema)
  .handler(({ data }) => rpc(async () => app().service.event(data.id, await requireUserId())))

export const createEvent = createServerFn({ method: 'POST' })
  .validator(createEventSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      const result = await app().service.createEvent(userId, data.name, data.participants)
      await app().telemetry.capture(userId, 'event_created', { participant_count: data.participants.length })
      return result
    }),
  )

export const selectEventRoster = createServerFn({ method: 'POST' })
  .validator(selectEventRosterSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      await app().service.selectEventRoster(data.id, userId, data.rosterId)
      await app().telemetry.capture(userId, 'event_roster_selected')
      return null
    }),
  )

export const sealEventRoster = createServerFn({ method: 'POST' })
  .validator(eventIdSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      const result = await app().service.sealEventRoster(data.id, userId)
      await app().telemetry.capture(userId, 'event_roster_sealed', { revealed: result.revealed })
      if (result.revealed) await app().telemetry.capture(userId, 'event_rosters_revealed')
      return result
    }),
  )

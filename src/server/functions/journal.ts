import { createServerFn } from '@tanstack/react-start'
import { app } from '../app'
import { requireUserId } from '../playerSession'
import { mutationRpc, rpc } from '../rpc'
import { journalEventSchema, journalGameSchema } from '../../core/gameJournal'
import { journalIdSchema } from '../../contracts/schemas'

export const journal = createServerFn({ method: 'GET' }).handler(() => rpc(async () => app().service.journal(await requireUserId())))

export const saveJournalGame = createServerFn({ method: 'POST' })
  .validator(journalGameSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      await app().service.saveJournalGame(userId, data)
      await app().telemetry.capture(userId, 'journal_game_saved', {
        result: data.result,
        scored: data.score !== null && data.opponentScore !== null,
        in_event: data.eventId !== null,
      })
      return null
    }),
  )

export const deleteJournalGame = createServerFn({ method: 'POST' })
  .validator(journalIdSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      await app().service.deleteJournalGame(await requireUserId(), data.id)
      return null
    }),
  )

export const saveJournalEvent = createServerFn({ method: 'POST' })
  .validator(journalEventSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      await app().service.saveJournalEvent(await requireUserId(), data)
      return null
    }),
  )

export const deleteJournalEvent = createServerFn({ method: 'POST' })
  .validator(journalIdSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      await app().service.deleteJournalEvent(await requireUserId(), data.id)
      return null
    }),
  )

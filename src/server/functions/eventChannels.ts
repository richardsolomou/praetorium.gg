import { z } from 'zod'
import { createServerFn } from '@tanstack/react-start'
import { app } from '../app'
import { requireUserId } from '../playerSession'
import { mutationRpc, rpc } from '../rpc'
import { discordWebhookName } from '../eventChannels'
import { captureMutation } from '../mutationTelemetry'
import { discordWebhookSchema } from '../../core/eventChannel'
import { tokenSchema } from '../../contracts/schemas'

const eventChannelHostSchema = tokenSchema.extend({ kind: z.enum(['group', 'tournament']) })

function refusal(result: 'missing' | 'forbidden') {
  if (result === 'missing') return new Response('no such group or tournament', { status: 404 })
  return new Response('only its organizers can manage its Discord channel', { status: 403 })
}

/** The Discord channel a group or tournament posts to, as its organizers see it: never the address itself. */
export const eventChannel = createServerFn({ method: 'GET' })
  .validator(eventChannelHostSchema)
  .handler(({ data }) =>
    rpc(async () => {
      const result = await app().repository.eventChannel(data.kind, data.token, await requireUserId())
      if (result === 'missing' || result === 'forbidden') throw refusal(result)
      return result
    }),
  )

/** Saves the webhook a group or tournament posts to, or removes it when `url` is null. */
export const setEventChannel = createServerFn({ method: 'POST' })
  .validator(eventChannelHostSchema.extend({ url: discordWebhookSchema.nullable() }))
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      const channel = data.url === null ? null : { url: data.url, name: await discordWebhookName(data.url) }
      const result = await app().repository.setEventChannel({
        kind: data.kind,
        token: data.token,
        actorId: userId,
        channel,
        now: Date.now(),
      })
      if (result === 'missing' && data.url === null) return
      if (result === 'missing' || result === 'forbidden') throw refusal(result)
      await captureMutation(userId, result === 'set' ? 'event_channel_set' : 'event_channel_removed', { host: data.kind })
    }),
  )

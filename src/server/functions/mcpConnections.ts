import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { app } from '../app'
import { requireUserId } from '../playerSession'
import { mutationRpc, rpc } from '../rpc'

export const mcpConnections = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => app().auth.mcpConnectionsFor(await requireUserId())),
)

export const revokeMcpConnection = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string().min(1).max(200) }))
  .handler(({ data }) =>
    mutationRpc(async () => {
      await app().auth.revokeMcpConsent(await requireUserId(), data.id)
      return null
    }),
  )

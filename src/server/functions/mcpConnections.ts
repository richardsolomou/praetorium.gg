import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { z } from 'zod'
import { app } from '../app'
import { requireUserId } from '../playerSession'
import { mutationRpc, rpc } from '../rpc'

export const mcpConnections = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => {
    await requireUserId()
    const instance = app()
    const headers = getRequestHeaders()
    const resource = new URL('/mcp', process.env.APP_URL).toString()
    const consents = await instance.auth.api.getOAuthConsents({ headers })
    return Promise.all(
      consents
        .filter((consent) => consent.resources?.includes(resource))
        .map(async (consent) => {
          const client = await instance.auth.api.getOAuthClientPublic({ query: { client_id: consent.clientId }, headers })
          return { id: consent.id, name: client.client_name || client.client_id, scopes: consent.scopes }
        }),
    )
  }),
)

export const revokeMcpConnection = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string().min(1).max(200) }))
  .handler(({ data }) =>
    mutationRpc(async () => {
      await app().auth.revokeMcpConsent(await requireUserId(), data.id)
      return null
    }),
  )

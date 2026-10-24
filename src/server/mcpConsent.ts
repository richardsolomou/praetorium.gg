import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { APIError } from 'better-auth/api'
import { constantTimeEqual, makeSignature } from 'better-auth/crypto'
import { MCP_CONSENT_REFUSALS } from '../shared/mcpConsent'
import { app } from './app'
import { currentUser } from './playerSession'
import { rpc } from './rpc'
import type { createSqliteAuth } from './sqliteAuth'

export const mcpConsentDetails = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => {
    const request = getRequest()
    const query = new URL(request.url).search.slice(1)
    const instance = app()
    if (!(await validConsentQuery(query, (await instance.auth.$context).secret))) {
      throw new Response(MCP_CONSENT_REFUSALS.expired, { status: 400 })
    }
    const params = new URLSearchParams(query)
    const clientId = params.get('client_id')
    if (!clientId) throw new Response('Missing client.', { status: 400 })
    const player = await currentUser(request)
    if (!player)
      return {
        signedIn: false as const,
        client: null,
        scopes: [] as string[],
        next: new URL(request.url).pathname + new URL(request.url).search,
      }
    return {
      signedIn: true as const,
      client: await consentClientName(instance.auth, clientId, request.headers),
      scopes: (params.get('scope') ?? '').split(' ').filter(Boolean),
      next: '',
    }
  }),
)

/** A client deleted or disabled after it started authorizing is a refusal the player can act on, not a fault. */
export async function consentClientName(auth: ReturnType<typeof createSqliteAuth>, clientId: string, headers: Headers) {
  try {
    const client = await auth.api.getOAuthClientPublic({ query: { client_id: clientId }, headers })
    return client.client_name || client.client_id
  } catch (error) {
    if (error instanceof APIError && error.status === 'NOT_FOUND') throw new Response(MCP_CONSENT_REFUSALS.unknown_client, { status: 400 })
    throw error
  }
}

export async function validConsentQuery(query: string, secret: string) {
  const params = new URLSearchParams(query)
  const signatures = params.getAll('sig')
  const expiry = Number(params.get('exp'))
  if (signatures.length !== 1 || !signatures[0] || !Number.isFinite(expiry) || expiry * 1000 < Date.now()) return false
  params.delete('sig')
  const ordered = [...params.entries()].sort(([leftKey, leftValue], [rightKey, rightValue]) => {
    if (leftKey !== rightKey) return leftKey < rightKey ? -1 : 1
    return leftValue === rightValue ? 0 : leftValue < rightValue ? -1 : 1
  })
  const expected = await makeSignature(new URLSearchParams(ordered).toString(), secret)
  return constantTimeEqual(signatures[0], expected)
}

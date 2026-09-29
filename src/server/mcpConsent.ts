import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { constantTimeEqual, makeSignature } from 'better-auth/crypto'
import { app } from './app'
import { currentUser } from './playerSession'
import { rpc } from './rpc'

export const mcpConsentDetails = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => {
    const request = getRequest()
    const query = new URL(request.url).search.slice(1)
    const instance = app()
    if (!(await validConsentQuery(query, (await instance.auth.$context).secret))) {
      throw new Response('This authorization request has expired.', { status: 400 })
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
    const client = await instance.auth.api.getOAuthClientPublic({ query: { client_id: clientId }, headers: request.headers })
    return {
      signedIn: true as const,
      client: client.client_name || client.client_id,
      scopes: (params.get('scope') ?? '').split(' ').filter(Boolean),
      next: '',
    }
  }),
)

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

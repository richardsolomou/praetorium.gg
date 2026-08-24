import { getRequest } from '@tanstack/react-start/server'
import { app } from './app'

type Player = {
  id: string
  name: string
  image: string | null
  email: string
  role: 'admin' | 'user'
  twoFactorEnabled: boolean
  impersonatedBy: string | null
}

/**
 * Who is asking, resolved once per request.
 *
 * A page is a handful of server functions, and rendering one asks this question
 * from every read that has an owner — the battle, the lists, the collection. Each
 * asked better-auth again, which is a signature check at best and a session read
 * at worst, repeated for an answer that cannot change inside one request. The
 * request object is the key and holds it weakly, so nothing outlives the request
 * it belongs to and a second request is never told about the first.
 */
const resolved = new WeakMap<Request, Promise<Player | null>>()

export function currentUser(request = getRequest()): Promise<Player | null> {
  const held = resolved.get(request)
  if (held) return held
  const asking = app()
    .auth.api.getSession({ headers: request.headers })
    .then((session) =>
      session
        ? {
            id: session.user.id,
            name: session.user.name,
            image: session.user.image ?? null,
            email: session.user.email,
            role: session.user.role === 'admin' ? ('admin' as const) : ('user' as const),
            twoFactorEnabled: session.user.twoFactorEnabled ?? false,
            impersonatedBy: session.session.impersonatedBy ?? null,
          }
        : null,
    )
    // A failed lookup must not be remembered as the answer for the rest of the request.
    .catch((error: unknown) => {
      resolved.delete(request)
      throw error
    })
  resolved.set(request, asking)
  return asking
}

export async function currentUserId(request = getRequest()) {
  return (await currentUser(request))?.id ?? null
}

export async function requireUserId(request = getRequest()) {
  const id = await currentUserId(request)
  if (!id) throw new Response('sign in first', { status: 401 })
  return id
}

export async function requireUser(request = getRequest()) {
  const user = await currentUser(request)
  if (!user) throw new Response('sign in first', { status: 401 })
  return user
}

export async function requireAdmin(request = getRequest()) {
  const session = await app().auth.api.getSession({ headers: request.headers, query: { disableCookieCache: true } })
  if (!session) throw new Response('sign in first', { status: 401 })
  const authoritative = await app().service.userById(session.user.id)
  if (authoritative?.role !== 'admin' || session.session.impersonatedBy) throw new Response('admin access required', { status: 403 })
  return {
    id: authoritative.id,
    name: authoritative.name,
    image: authoritative.image ?? null,
    email: authoritative.email,
    role: 'admin' as const,
    twoFactorEnabled: authoritative.twoFactorEnabled,
    impersonatedBy: null,
  }
}

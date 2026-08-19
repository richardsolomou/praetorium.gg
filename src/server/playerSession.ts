import { getRequest } from '@tanstack/react-start/server'
import { app } from './app'

export async function currentUser(request = getRequest()) {
  const session = await app().auth.api.getSession({ headers: request.headers })
  if (!session) return null
  return { id: session.user.id, name: session.user.name, image: session.user.image ?? null, email: session.user.email }
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

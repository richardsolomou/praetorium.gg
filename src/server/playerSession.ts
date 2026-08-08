import { getRequest } from '@tanstack/react-start/server'
import { app } from './app'

export async function currentPlayer(request = getRequest()) {
  const session = await app().auth.api.getSession({ headers: request.headers })
  if (!session) return null
  const id = app().service.playerForUser(session.user.id, session.user.name)
  return { id, name: session.user.name }
}

export async function currentPlayerId(request = getRequest()) {
  return (await currentPlayer(request))?.id ?? null
}

export async function requirePlayerId(request = getRequest()) {
  const id = await currentPlayerId(request)
  if (!id) throw new Response('sign in first', { status: 401 })
  return id
}

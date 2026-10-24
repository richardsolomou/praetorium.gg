import { QueryClient } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import { authClient } from './authClient'
import { writesPending } from './pendingWrites'

afterEach(() => vi.unstubAllGlobals())

function heldFetch() {
  let answer!: () => void
  const fetch = vi.fn(() => new Promise<Response>((resolve) => (answer = () => resolve(Response.json({})))))
  vi.stubGlobal('fetch', fetch)
  return { fetch, answer: () => answer() }
}

it('holds automatic reloads while an account change is sent', async () => {
  const { fetch, answer } = heldFetch()
  const signingOut = authClient.signOut()
  await vi.waitFor(() => expect(fetch).toHaveBeenCalled())
  expect(writesPending(new QueryClient())).toBe(true)
  answer()
  await signingOut
})

it('leaves automatic reloads free while the session is read', async () => {
  const { fetch, answer } = heldFetch()
  const reading = authClient.getSession()
  await vi.waitFor(() => expect(fetch).toHaveBeenCalled())
  expect(writesPending(new QueryClient())).toBe(false)
  answer()
  await reading
})

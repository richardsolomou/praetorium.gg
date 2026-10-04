import { QueryClient } from '@tanstack/react-query'
import { expect, it } from 'vitest'
import { parseAppSnapshot } from '../../contracts/appSnapshot'
import { captureAppSnapshot, restoreAppSnapshot, reconcileAppAccount } from './appSnapshot'

it('restores the saved home and paginated battles before a network request is needed', () => {
  const first = new QueryClient()
  first.setQueryData(['me'], { id: 'alice', impersonatedBy: null })
  first.setQueryData(['home-rosters'], { count: 1, rosters: [{ name: 'My army' }] })
  first.setQueryData(['battles'], { pages: [{ battles: [{ token: 'game' }] }], pageParams: [null] })
  const reopened = new QueryClient()
  restoreAppSnapshot(reopened, captureAppSnapshot(first)!)
  expect(reopened.getQueryData(['battles'])).toEqual({ pages: [{ battles: [{ token: 'game' }] }], pageParams: [null] })
})

it('does not persist account methods, sessions, administration or mutation state', () => {
  const client = new QueryClient()
  client.setQueryData(['me'], { id: 'alice', impersonatedBy: null })
  for (const key of ['account-methods', 'admin', 'sign-in-options', 'friend-invite']) client.setQueryData([key], 'secret')
  expect(captureAppSnapshot(client)!.queries.map((query) => query.key)).toEqual([['me']])
})

it('rejects a snapshot whose private data belongs to another account', () => {
  expect(parseAppSnapshot({ version: 1, owner: 'bob', queries: [{ key: ['me'], data: { id: 'alice' }, updatedAt: 1 }] })).toBeNull()
})

it('does not save an impersonated account', () => {
  const client = new QueryClient()
  client.setQueryData(['me'], { id: 'alice', impersonatedBy: 'admin' })
  expect(captureAppSnapshot(client)).toBeNull()
})

it('removes previous private queries when the server reports another account', () => {
  const client = new QueryClient()
  client.setQueryData(['me'], { id: 'alice' })
  client.setQueryData(['home-rosters'], { rosters: ['Alice army'] })
  client.setQueryData(['rule-index'], { documents: ['Core rules'] })
  reconcileAppAccount(client, { id: 'bob' })
  expect(client.getQueryData(['home-rosters'])).toBeUndefined()
})

it('keeps the public reference when an account signs out', () => {
  const client = new QueryClient()
  client.setQueryData(['me'], { id: 'alice' })
  client.setQueryData(['rule-index'], { documents: ['Core rules'] })
  reconcileAppAccount(client, null)
  expect(client.getQueryData(['rule-index'])).toEqual({ documents: ['Core rules'] })
})

it('never restores an older saved response over fresher server data', () => {
  const client = new QueryClient()
  client.setQueryData(['me'], { id: 'alice' }, { updatedAt: 10 })
  client.setQueryData(['home-rosters'], 'New army', { updatedAt: 20 })
  restoreAppSnapshot(client, { version: 1, owner: 'alice', queries: [{ key: ['home-rosters'], data: 'Old army', updatedAt: 1 }] })
  expect(client.getQueryData(['home-rosters'])).toBe('New army')
})

it('keeps the last successful data after a background refresh fails', async () => {
  const client = new QueryClient()
  client.setQueryData(['me'], { id: 'alice' })
  client.setQueryData(['home-rosters'], 'My army')
  await client.query({ queryKey: ['home-rosters'], staleTime: 0, queryFn: () => Promise.reject(new Error('Offline')) }).catch(() => {})
  expect(captureAppSnapshot(client)!.queries.find((query) => query.key[0] === 'home-rosters')?.data).toBe('My army')
})

it('drops in-flight responses from the previous account', async () => {
  const client = new QueryClient()
  client.setQueryData(['me'], { id: 'alice' })
  let resolve!: (data: string) => void
  const fetching = client
    .query({
      queryKey: ['home-rosters'],
      queryFn: () =>
        new Promise<string>((done) => {
          resolve = done
        }),
    })
    .catch(() => {})
  reconcileAppAccount(client, { id: 'bob' })
  resolve('Alice army')
  await fetching
  expect(client.getQueryData(['home-rosters'])).toBeUndefined()
})

it('clears non-persisted private reads as well as saved ones on account changes', () => {
  const client = new QueryClient()
  client.setQueryData(['me'], { id: 'alice' })
  client.setQueryData(['admin', 'sessions'], 'Alice sessions')
  reconcileAppAccount(client, null)
  expect(client.getQueryData(['admin', 'sessions'])).toBeUndefined()
})

import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { emptyLocalState } from '../../contracts/localState'
import { attemptLocalSync, configureLocalRuntime, localEngine, rememberDocument, stopLocalRuntime } from './localRuntime'

const mocks = vi.hoisted(() => ({ storage: vi.fn() }))
vi.mock('./localStorage', () => ({ localStateStorage: mocks.storage }))
vi.mock('../nativeBridge', () => ({ nativeBridgeVersion: () => undefined }))
const client = new QueryClient()
beforeEach(() => {
  vi.stubGlobal('window', {})
  client.clear()
  client.setQueryData(['me'], { id: 'alice' })
  configureLocalRuntime(client, () => {})
  mocks.storage.mockReset()
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  stopLocalRuntime()
  vi.unstubAllGlobals()
})
it('does not write a previous account download into the current account', async () => {
  let bob = emptyLocalState('bob')
  mocks.storage.mockReturnValue({ read: async () => bob, change: async (update: (state: typeof bob) => typeof bob) => (bob = update(bob)) })
  client.setQueryData(['me'], { id: 'bob' })
  await expect(rememberDocument('roster:alice', { name: 'Private army' }, 1, 'alice')).rejects.toThrow('account changed')
  expect(bob.documents).toEqual({})
})
it('checks the account again inside a delayed durable transaction', async () => {
  let alice = emptyLocalState('alice')
  mocks.storage.mockReturnValue({
    read: async () => alice,
    change: async (update: (state: typeof alice) => typeof alice) => {
      client.setQueryData(['me'], { id: 'bob' })
      alice = update(alice)
      return alice
    },
  })
  await expect(rememberDocument('roster:alice', { name: 'Private army' }, 1, 'alice')).rejects.toThrow('account changed')
  expect(alice.documents).toEqual({})
})
it('rejects an old downloader after the same account runtime has been replaced', async () => {
  const state = emptyLocalState('alice')
  mocks.storage.mockReturnValue({
    read: async () => state,
    change: async (update: (current: typeof state) => typeof state) => {
      stopLocalRuntime()
      return update(state)
    },
  })
  await expect(rememberDocument('roster:alice', { name: 'Private army' }, 1, 'alice')).rejects.toThrow('account changed')
})

it('releases a stalled connected sync after fifteen seconds with pending work intact', async () => {
  vi.useFakeTimers()
  vi.stubGlobal('navigator', { onLine: true })
  const state = emptyLocalState('alice')
  state.operations.push({ id: 'saved', kind: 'saveRoster', resource: 'roster:1', input: {}, createdAt: 1, status: 'pending' })
  mocks.storage.mockReturnValue({ read: async () => state })
  vi.spyOn(localEngine()!, 'sync').mockImplementation(() => new Promise<void>(() => {}))
  let finished = false
  const syncing = attemptLocalSync().then(() => {
    finished = true
  })
  await vi.advanceTimersByTimeAsync(14_999)
  expect(finished).toBe(false)
  await vi.advanceTimersByTimeAsync(1)
  await syncing
  expect({ finished, pending: state.operations.map(({ id, status }) => ({ id, status })) }).toEqual({
    finished: true,
    pending: [{ id: 'saved', status: 'pending' }],
  })
})

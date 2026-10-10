import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { emptyLocalState } from '../../contracts/localState'
import { configureLocalRuntime, rememberDocument, stopLocalRuntime } from './localRuntime'

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

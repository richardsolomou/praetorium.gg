import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { setPushNotifications } from './actionFunctions'

const runtime = vi.hoisted(() => ({
  owner: 'alice',
  operations: [] as { id: string; status: string; message?: string }[],
  queue: vi.fn(),
  sync: vi.fn(),
}))
vi.mock('./localRuntime', () => ({
  localOwner: () => ({ id: runtime.owner }),
  localEngine: () => ({ storage: { read: async () => ({ operations: runtime.operations }) } }),
  queueLocal: runtime.queue,
  syncLocalWork: runtime.sync,
  localClient: () => undefined,
  localDocument: vi.fn(),
  hasLocalChanges: vi.fn(),
  rememberDocument: vi.fn(),
}))
beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('navigator', { onLine: true })
  runtime.owner = 'alice'
  runtime.operations = [{ id: 'saved', status: 'pending' }]
  runtime.queue.mockResolvedValue({ id: 'saved' })
  runtime.sync.mockReset()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
it('releases a connected action after fifteen seconds with its pending work intact', async () => {
  runtime.sync.mockImplementation(() => new Promise<void>(() => {}))
  const saving = setPushNotifications({ data: { enabled: true } })
  await vi.advanceTimersByTimeAsync(15_000)
  expect({ result: await saving, pending: runtime.operations }).toEqual({ result: true, pending: [{ id: 'saved', status: 'pending' }] })
})
it('reports an authoritative refusal without discarding the saved action', async () => {
  runtime.operations[0] = { id: 'saved', status: 'refused', message: 'The account cannot change this setting.' }
  runtime.sync.mockResolvedValue(undefined)
  await expect(setPushNotifications({ data: { enabled: true } })).rejects.toThrow('The account cannot change this setting.')
})
it('rejects the result when the account changes while an action syncs', async () => {
  runtime.sync.mockImplementation(async () => {
    runtime.owner = 'bob'
  })
  await expect(setPushNotifications({ data: { enabled: true } })).rejects.toThrow('The account changed while saving this action.')
})

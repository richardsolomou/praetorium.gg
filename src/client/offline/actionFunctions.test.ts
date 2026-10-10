import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { setPushNotifications, submitLeagueRoster } from './actionFunctions'

const runtime = vi.hoisted(() => ({
  owner: 'alice',
  operations: [] as { id: string; status: string; message?: string }[],
  queue: vi.fn(),
  sync: vi.fn(),
  document: vi.fn(),
  construction: vi.fn(),
}))
vi.mock('./localRuntime', () => ({
  localOwner: () => ({ id: runtime.owner }),
  localEngine: () => ({ storage: { read: async () => ({ operations: runtime.operations }) } }),
  queueLocal: runtime.queue,
  attemptLocalSync: runtime.sync,
  localClient: () => undefined,
  localDocument: runtime.document,
  hasLocalChanges: vi.fn(),
  rememberDocument: vi.fn(),
}))
vi.mock('./construction', () => ({ localConstruction: runtime.construction }))
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

it('refuses a saved preview league roster before enqueueing a seal', async () => {
  runtime.document.mockResolvedValue({ catalogueId: 'codex~cat' })
  runtime.construction.mockReturnValue({ catalogue: { edition: { status: 'preview' } } })
  runtime.queue.mockClear()
  vi.stubGlobal('navigator', { onLine: false })
  await expect(submitLeagueRoster({ data: { token: 'league', rosterId: 'roster' } })).rejects.toThrow(
    'preview codex rules cannot be submitted to a league',
  )
  expect(runtime.queue).not.toHaveBeenCalled()
})

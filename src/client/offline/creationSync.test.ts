import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { emptyLocalState } from '../../contracts/localState'
import { configureLocalRuntime, localEngine, stopLocalRuntime } from './localRuntime'
const mocks = vi.hoisted(() => ({ storage: vi.fn(), syncAction: vi.fn(), workspace: vi.fn() }))
vi.mock('./localStorage', () => ({ localStateStorage: mocks.storage }))
vi.mock('../nativeBridge', () => ({ nativeBridgeVersion: () => undefined }))
vi.mock('../../server/functions/offline', () => ({
  syncRoster: vi.fn(),
  syncAction: mocks.syncAction,
  syncBattleCommand: vi.fn(),
  battleWorkspace: mocks.workspace,
}))
const client = new QueryClient()
let state = emptyLocalState('alice')
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('window', {})
  vi.stubGlobal('navigator', { onLine: true })
  state = emptyLocalState('alice')
  mocks.storage.mockReturnValue({
    read: async () => state,
    change: async (update: (current: typeof state) => typeof state) => {
      state = { ...update(state), revision: state.revision + 1 }
      return state
    },
  })
  client.clear()
  client.setQueryData(['me'], { id: 'alice' })
  configureLocalRuntime(client, () => {})
})
afterEach(() => {
  stopLocalRuntime()
  vi.unstubAllGlobals()
})
it.each(['createBattle', 'createLeagueBattle'] as const)(
  'uses the hydrated %s acknowledgement without another network read',
  async (kind) => {
    const workspace = { battle: { token: 'created' }, serverSeq: 1, log: [] }
    mocks.syncAction.mockResolvedValue({ outcome: 'applied', workspace, version: 1 })
    mocks.workspace.mockRejectedValue(new Error('Battle was deleted after acknowledgement'))
    const engine = localEngine()!
    await engine.enqueue({
      id: crypto.randomUUID(),
      resource: 'battle:created',
      kind,
      createdAt: 1,
      status: 'pending',
      input: {
        input: kind === 'createBattle' ? { opponentId: 'friend' } : { token: 'league', opponentId: 'friend' },
        identifiers: { battleToken: 'created' },
      },
    })
    await engine.sync()
    expect({
      pending: state.operations,
      saved: state.documents['battle:created'],
      additionalReads: mocks.workspace.mock.calls.length,
    }).toEqual({ pending: [], saved: { data: workspace, serverVersion: 1 }, additionalReads: 0 })
  },
)

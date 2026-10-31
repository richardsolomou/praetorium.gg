import { afterEach, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { ALICE, NAMES, log, started } from '../../core/battle.fixtures'
import { openBattle, replayBattleAt } from './battleFunctions'

const mocks = vi.hoisted(() => ({ open: vi.fn(), replayAt: vi.fn(), owner: 'alice' }))
const client = new QueryClient()
const history = log(...started())
const workspace = {
  battle: { id: 'battle', token: 'token', createdAt: 0 },
  players: NAMES.map((player, side) => ({ ...player, side, automated: false })),
  log: history,
  serverSeq: history.length,
  serverNow: 10,
}
vi.mock('../../server/functions', () => ({ openBattle: mocks.open, replayBattleAt: mocks.replayAt }))
vi.mock('./construction', () => ({ localRules: () => null, loadLocalRules: async () => null }))
vi.mock('./localRuntime', () => ({
  localClient: () => client,
  localOwner: () => ({ id: mocks.owner }),
  localDocument: async () => workspace,
  localEngine: () => null,
  hasLocalChanges: async () => false,
  hasSyncableChanges: async () => false,
}))
afterEach(() => {
  vi.unstubAllGlobals()
  client.clear()
  mocks.owner = ALICE
})

it('opens a clean durable battle when connected reads fail and its screen cache was evicted', async () => {
  vi.stubGlobal('window', {})
  vi.stubGlobal('navigator', { onLine: true })
  mocks.open.mockRejectedValue(new TypeError('Failed to fetch'))
  const result = await openBattle({ data: { token: 'token' } })
  expect(result?.kind === 'battle' ? result.view.seq : null).toBe(history.length)
})

it('does not return an old account battle after a failed request under a new account', async () => {
  vi.stubGlobal('window', {})
  vi.stubGlobal('navigator', { onLine: true })
  mocks.open.mockImplementation(async () => {
    mocks.owner = 'bob'
    throw new TypeError('Failed to fetch')
  })
  await expect(openBattle({ data: { token: 'token' } })).rejects.toThrow('Failed to fetch')
})

it.each(['service', 'device'])('replays a clean saved battle from the %s history', async (source) => {
  vi.stubGlobal('window', {})
  vi.stubGlobal('navigator', { onLine: source === 'service' })
  mocks.replayAt.mockResolvedValue({ kind: 'replay', view: { seq: history.length + 3 } })
  const frame = await replayBattleAt({ data: { token: 'token', seq: history.length + 3 } })
  expect(frame.kind === 'replay' && frame.view.seq === history.length + 3 ? 'service' : 'device').toBe(source)
})

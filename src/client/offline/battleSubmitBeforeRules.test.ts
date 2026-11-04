import { afterEach, expect, it, vi } from 'vitest'
import { NAMES, log, started } from '../../core/battle.fixtures'
import { submit } from './battleFunctions'

const mocks = vi.hoisted(() => ({ submit: vi.fn(), remember: vi.fn() }))
const history = log(...started())
const workspace = {
  battle: { id: 'battle', token: 'token', createdAt: 0 },
  players: NAMES.map((player, side) => ({ ...player, side, automated: false })),
  log: history,
  serverSeq: history.length,
  serverNow: 10,
}
const screen = { kind: 'battle', view: { viewerId: 'alice', seq: history.length } }
vi.mock('../../server/functions', () => ({ submit: mocks.submit }))
vi.mock('./construction', () => ({ hasLocalConstruction: () => false, localRules: () => null, loadLocalRules: async () => null }))
vi.mock('./localRuntime', () => ({
  localOwner: () => ({ id: 'alice' }),
  localEngine: () => ({}),
  hasSyncableChanges: async () => false,
  rememberBattle: mocks.remember,
}))
afterEach(() => vi.unstubAllGlobals())

it('keeps the saved battle current for commands sent before the offline rules download', async () => {
  vi.stubGlobal('navigator', { onLine: true })
  mocks.submit.mockResolvedValue({ result: { outcome: 'appended', seq: history.length }, screen, workspace })
  await submit({ data: { token: 'token', expectedSeq: history.length - 1, command: { kind: 'advance' } } })
  expect(mocks.remember).toHaveBeenCalledWith(workspace, 'alice')
})

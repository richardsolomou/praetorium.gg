import { afterEach, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { emptyLocalState } from '../../contracts/localState'
import { configureLocalRuntime } from './localRuntime'
import { projectBattles, workspaceScreen } from './battleFunctions'
import { ALICE, BOB, NAMES, log, started } from '../../core/battle.fixtures'
import type { BattleWorkspace } from '../../contracts/battleWorkspace'

const construction = vi.hoisted(() => ({ data: vi.fn<() => object | null>(() => null), local: vi.fn(() => null) }))
vi.mock('./construction', () => ({ constructionData: construction.data, localConstruction: construction.local }))

afterEach(() => {
  vi.unstubAllGlobals()
  construction.data.mockReset()
  construction.data.mockReturnValue(null)
  construction.local.mockClear()
})

it('keeps authoritative battle missions until local rules are available', () => {
  vi.stubGlobal('window', {})
  const client = new QueryClient()
  configureLocalRuntime(client, () => {})
  client.setQueryData(['me'], { id: 'alice' })
  const screen = { kind: 'battle', view: { seq: 0 }, missions: [{ side: 0, mission: { id: 'primary' } }] }
  client.setQueryData(['battle', 'token'], screen)
  const state = emptyLocalState('alice')
  state.documents['battle:token'] = { data: { battle: { token: 'token' }, players: [], log: [] }, serverVersion: 0 }
  projectBattles(state)
  expect(client.getQueryData(['battle', 'token'])).toBe(screen)
})

function workspace(finished = false): BattleWorkspace {
  const history = log(
    ...started(),
    ...(finished ? [[ALICE, { kind: 'end-battle', reason: 'conceded', concededBy: BOB }] as Parameters<typeof log>[number]] : []),
  )
  return {
    battle: { id: 'battle', token: 'token', createdAt: 0 },
    players: NAMES.map((player, side) => ({ ...player, side, automated: false })),
    log: history,
    serverSeq: history.length,
    serverNow: 10,
  }
}
it('omits the replay timeline while a local battle is active', () => {
  expect(workspaceScreen(workspace(), ALICE).timeline).toBeUndefined()
})
it('preserves report labels in the finished local battle timeline', () => {
  expect(workspaceScreen(workspace(true), ALICE).timeline?.at(-1)?.text).toBe('Alice records that Bob concedes')
})

it('keeps connected authoritative battle data without constructing clean downloaded workspaces', () => {
  vi.stubGlobal('window', {})
  vi.stubGlobal('navigator', { onLine: true })
  construction.data.mockReturnValue({})
  const client = new QueryClient()
  configureLocalRuntime(client, () => {})
  client.setQueryData(['me'], { id: 'alice' })
  const screen = { kind: 'battle', view: { seq: 0 }, missions: [{ side: 0, mission: { id: 'primary' } }] }
  client.setQueryData(['battle', 'token'], screen)
  const state = emptyLocalState('alice')
  state.documents['battle:token'] = { data: workspace(), serverVersion: 0 }
  projectBattles(state)
  expect({ screen: client.getQueryData(['battle', 'token']), builds: construction.local.mock.calls.length }).toEqual({ screen, builds: 0 })
})

import { afterEach, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { emptyLocalState } from '../../contracts/localState'
import { configureLocalRuntime } from './localRuntime'
import { predictedBattle, projectBattles, workspaceScreen } from './battleFunctions'
import { ALICE, BOB, NAMES, log, started } from '../../core/battle.fixtures'
import type { BattleWorkspace } from '../../contracts/battleWorkspace'

const construction = vi.hoisted(() => ({ data: vi.fn<() => object | null>(() => null), local: vi.fn(() => null) }))
vi.mock('./construction', () => ({ constructionData: construction.data, localConstruction: construction.local }))

afterEach(() => {
  vi.unstubAllGlobals()
  construction.data.mockReset()
  construction.data.mockReturnValue(null)
  construction.local.mockReset()
})

it('keeps authoritative battle missions until local rules are available', () => {
  vi.stubGlobal('window', {})
  vi.stubGlobal('navigator', { onLine: false })
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
  expect({
    screen: client.getQueryData(['battle', 'token']),
    restores: construction.data.mock.calls.length,
    builds: construction.local.mock.calls.length,
  }).toEqual({ screen, restores: 0, builds: 0 })
})

it('does not restore construction data while projecting roster work without battles', () => {
  vi.stubGlobal('window', {})
  vi.stubGlobal('navigator', { onLine: true })
  const client = new QueryClient()
  configureLocalRuntime(client, () => {})
  client.setQueryData(['me'], { id: 'alice' })
  const state = emptyLocalState('alice')
  state.documents['roster:army'] = { data: { id: 'army' }, serverVersion: 1 }
  projectBattles(state)
  expect(construction.data).not.toHaveBeenCalled()
})

it.each([false, true])('projects a battle that needs local rules while online=%s', (online) => {
  vi.stubGlobal('window', {})
  vi.stubGlobal('navigator', { onLine: online })
  construction.data.mockReturnValue({})
  const client = new QueryClient()
  configureLocalRuntime(client, () => {})
  client.setQueryData(['me'], { id: ALICE })
  const saved = workspace()
  const state = emptyLocalState(ALICE)
  state.documents['battle:token'] = { data: saved, serverVersion: 0 }
  if (online)
    state.operations.push({ id: 'pending', resource: 'battle:token', kind: 'battleCommand', input: {}, createdAt: 1, status: 'pending' })
  projectBattles(state)
  expect(client.getQueryData(['battle', 'token'])).toMatchObject({ kind: 'battle', view: { seq: saved.log.at(-1)!.seq } })
})

it('keeps the connected battle screen while an earlier conflict awaits review', () => {
  vi.stubGlobal('window', {})
  vi.stubGlobal('navigator', { onLine: true })
  construction.data.mockReturnValue({})
  const client = new QueryClient()
  configureLocalRuntime(client, () => {})
  client.setQueryData(['me'], { id: ALICE })
  const screen = { kind: 'battle', view: { seq: 0 }, missions: [] }
  client.setQueryData(['battle', 'token'], screen)
  const state = emptyLocalState(ALICE)
  state.documents['battle:token'] = { data: workspace(), serverVersion: 0 }
  state.operations.push({ id: 'conflict', resource: 'battle:token', kind: 'battleCommand', input: {}, createdAt: 1, status: 'conflict' })
  projectBattles(state)
  expect(client.getQueryData(['battle', 'token'])).toBe(screen)
})

it('works out a command on the device at the next sequence before the service answers', () => {
  construction.local.mockReturnValue({ rules: { missions: new Map() } } as never)
  const battle = predictedBattle({ workspace: workspace(), viewerId: ALICE }, { kind: 'advance' })
  expect(battle?.screen.view.seq).toBe(workspace().log.length + 1)
})

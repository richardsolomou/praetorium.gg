import { afterEach, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { emptyLocalState } from '../../contracts/localState'
import { configureLocalRuntime } from './localRuntime'
import { projectBattles } from './battleFunctions'

vi.mock('./construction', () => ({ localConstruction: () => null }))

afterEach(() => vi.unstubAllGlobals())

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

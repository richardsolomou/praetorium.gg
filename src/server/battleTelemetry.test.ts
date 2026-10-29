import { beforeEach, expect, it, vi } from 'vitest'
import type { Command } from '../core/battle'
import { captureBattleCommand } from './battleTelemetry'

const mocks = vi.hoisted(() => ({ capture: vi.fn() }))
vi.mock('./app', () => ({ app: () => ({ telemetry: { capture: mocks.capture } }) }))

const appended = { result: { outcome: 'appended', seq: 1 } } as const
const submitted = () => mocks.capture.mock.calls.find(([, event]) => event === 'battle_command_submitted')?.[2]
const finishes = () => mocks.capture.mock.calls.filter(([, event]) => event === 'battle_finished').map(([, , properties]) => properties)

beforeEach(() => mocks.capture.mockReset())

it('reports the formation a unit was set to', async () => {
  await captureBattleCommand(
    'player',
    'battle-id',
    { kind: 'set-unit-formation', unitKey: 'u0', formation: 'deep-strike' },
    appended,
    1,
    'direct',
  )

  expect(submitted()).toMatchObject({ formation: 'deep-strike' })
})

it('marks an action recorded against an earlier phase', async () => {
  const missed = { round: 1, turn: 'player', phase: 'command' } as const
  await captureBattleCommand('player', 'battle-id', { kind: 'adjust-cp', playerId: 'player', delta: 1, missed }, appended, 1, 'direct')

  expect(submitted()).toMatchObject({ missed: true })
})

it('counts the units an attached list starts embarked, without naming them', async () => {
  const units = [{ key: 'u0', startsEmbarkedIn: 'u2' }, { key: 'u1', startsEmbarkedIn: 'u2' }, { key: 'u2' }]
  const command = { kind: 'attach-roster', roster: { built: { units } } } as unknown as Command

  await captureBattleCommand('player', 'battle-id', command, appended, 1, 'sync')

  expect(submitted()).toMatchObject({ listed_embark_count: 2 })
})

it('identifies the battle a command was submitted to', async () => {
  await captureBattleCommand('player', 'battle-id', { kind: 'reset-setup' }, appended, 1, 'direct')

  expect(submitted()).toMatchObject({ battle_id: 'battle-id' })
})

it('identifies the battle a lifecycle change belongs to', async () => {
  await captureBattleCommand('player', 'battle-id', { kind: 'begin-battle', firstPlayerId: 'player' }, appended, 1, 'direct')

  expect(mocks.capture).toHaveBeenLastCalledWith('player', 'battle_started', { battle_id: 'battle-id', delivery: 'direct' })
})

it.each(['advance', 'settle-opponent-turn', 'end-battle'] as const)('reports a battle that %s finished once, with why', async (kind) => {
  await captureBattleCommand('player', 'battle-id', { kind }, { ...appended, finished: 'completed' }, 1, 'direct')

  expect(finishes()).toEqual([{ battle_id: 'battle-id', reason: 'completed', delivery: 'direct' }])
})

it('reports no finish for an ending command the battle did not finish on', async () => {
  await captureBattleCommand('player', 'battle-id', { kind: 'end-battle', reason: 'conceded', concededBy: 'player' }, appended, 1, 'sync')

  expect(finishes()).toEqual([])
})

import { beforeEach, expect, it, vi } from 'vitest'
import type { Command } from '../core/battle'
import { captureBattleCommand } from './battleTelemetry'

const mocks = vi.hoisted(() => ({ capture: vi.fn() }))
vi.mock('./app', () => ({ app: () => ({ telemetry: { capture: mocks.capture } }) }))

const appended = { outcome: 'appended', seq: 1 } as const
const submitted = () => mocks.capture.mock.calls.find(([, event]) => event === 'battle_command_submitted')?.[2]

beforeEach(() => mocks.capture.mockReset())

it('reports the formation a unit was set to', async () => {
  await captureBattleCommand('player', { kind: 'set-unit-formation', unitKey: 'u0', formation: 'deep-strike' }, appended, 1, 'direct')

  expect(submitted()).toMatchObject({ formation: 'deep-strike' })
})

it('counts the units an attached list starts embarked, without naming them', async () => {
  const units = [{ key: 'u0', startsEmbarkedIn: 'u2' }, { key: 'u1', startsEmbarkedIn: 'u2' }, { key: 'u2' }]
  const command = { kind: 'attach-roster', roster: { built: { units } } } as unknown as Command

  await captureBattleCommand('player', command, appended, 1, 'sync')

  expect(submitted()).toMatchObject({ listed_embark_count: 2 })
})

import { beforeEach, expect, it, vi } from 'vitest'
import { createBattle, submit } from './battles'
import { createBattleSchema, submitSchema } from '../schemas'

const mocks = vi.hoisted(() => ({ capture: vi.fn(), createBattle: vi.fn(), submit: vi.fn() }))

vi.mock('@tanstack/react-start', () => {
  const builder = () => ({ validator: () => builder(), handler: (handler: unknown) => handler })
  return { createServerFn: builder }
})
vi.mock('../rpc', () => ({ rpc: (work: () => unknown) => work(), mutationRpc: (work: () => unknown) => work() }))
vi.mock('../playerSession', () => ({ requireUser: async () => ({ id: 'actor' }) }))
vi.mock('../battleSubmission', () => ({ submittedBattleCommand: async (_actor: string, command: unknown) => command }))
vi.mock('../app', () => ({
  app: () => ({ service: mocks, telemetry: { capture: mocks.capture }, rulesFor: async () => null }),
}))

const invokeCreate = createBattle as unknown as (input: { data: ReturnType<typeof createBattleSchema.parse> }) => Promise<unknown>
const invokeSubmit = submit as unknown as (input: { data: ReturnType<typeof submitSchema.parse> }) => Promise<unknown>

beforeEach(() => {
  vi.resetAllMocks()
  mocks.createBattle.mockResolvedValue({ token: 'private-battle', practice: false })
  mocks.submit.mockResolvedValue({ result: { outcome: 'appended' } })
})

it.each([
  [{ opponentId: 'opponent' }, 2],
  [{ opponentIds: ['opponent'] }, 2],
  [{ opponentIds: ['opponent', 'second'] }, 3],
  [{ opponentIds: ['opponent'], allyId: 'ally' }, 3],
  [{ opponentIds: ['opponent', 'second'], allyId: 'ally' }, 4],
])('counts the named players after battle creation for %j', async (players, count) => {
  await invokeCreate({ data: createBattleSchema.parse({ ...players, limit: 2000, casual: true }) })
  expect(mocks.capture.mock.calls).toEqual([
    ['actor', 'battle_created', { practice: false, limit: 2000, player_count: count, casual: true }],
  ])
})

it('does not report a battle created when the write fails', async () => {
  mocks.createBattle.mockRejectedValue(new Error('write failed'))
  await invokeCreate({ data: createBattleSchema.parse({ opponentId: 'opponent' }) }).catch(() => {})
  expect(mocks.capture).not.toHaveBeenCalled()
})

it.each(['appended', 'rejected'])('records the attempted setup step and its %s outcome without a battle token', async (outcome) => {
  mocks.submit.mockResolvedValue({ result: { outcome } })
  await invokeSubmit({
    data: submitSchema.parse({ token: 'private-battle', expectedSeq: 0, command: { kind: 'set-setup-step', step: 3 } }),
  })
  expect(mocks.capture.mock.calls).toEqual([
    ['actor', 'battle_command_submitted', { command: 'set-setup-step', outcome, setup_step: 3, duration_ms: expect.any(Number) }],
  ])
})

it('keeps ordinary battle command payloads out of telemetry', async () => {
  await invokeSubmit({ data: submitSchema.parse({ token: 'private-battle', expectedSeq: 0, command: { kind: 'reset-setup' } }) })
  expect(mocks.capture.mock.calls).toEqual([
    ['actor', 'battle_command_submitted', { command: 'reset-setup', outcome: 'appended', duration_ms: expect.any(Number) }],
  ])
})

it('reports no preset size for an automatically configured battle', async () => {
  await invokeCreate({ data: createBattleSchema.parse({ opponentId: 'opponent', limit: null, casual: true }) })
  expect(mocks.capture.mock.calls).toEqual([['actor', 'battle_created', { practice: false, limit: null, player_count: 2, casual: true }]])
})

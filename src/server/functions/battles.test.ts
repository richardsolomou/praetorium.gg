import { beforeEach, expect, it, vi } from 'vitest'
import { createBattle, submit } from './battles'
import { createBattleSchema, submitSchema } from '../../contracts/schemas'

const mocks = vi.hoisted(() => ({ actor: vi.fn(), capture: vi.fn(), createBattle: vi.fn(), submit: vi.fn(), submitWithWorkspace: vi.fn() }))

vi.mock('@tanstack/react-start', () => {
  const builder = () => ({ validator: () => builder(), handler: (handler: unknown) => handler })
  return { createServerFn: builder }
})
vi.mock('../rpc', () => ({ rpc: (work: () => unknown) => work(), mutationRpc: (work: () => unknown) => work() }))
vi.mock('../playerSession', () => ({ requireUserId: async () => 'actor' }))
vi.mock('../guestSession', () => ({ requireBattleActor: async () => mocks.actor() }))
vi.mock('../app', () => ({
  app: () => ({ service: mocks, telemetry: { capture: mocks.capture }, rulesFor: async () => null }),
}))

const invokeCreate = createBattle as unknown as (input: { data: ReturnType<typeof createBattleSchema.parse> }) => Promise<unknown>
const invokeSubmit = submit as unknown as (input: {
  data: ReturnType<typeof submitSchema.parse> & { workspace?: boolean }
}) => Promise<unknown>

beforeEach(() => {
  vi.resetAllMocks()
  mocks.createBattle.mockResolvedValue({ battleId: 'battle-id', token: 'private-battle', practice: false })
  mocks.submit.mockResolvedValue({ result: { outcome: 'appended' }, battleId: 'battle-id' })
  mocks.actor.mockReturnValue('actor')
})

it.each([
  [{ opponentId: 'opponent' }, 2],
  [{ opponentIds: ['opponent'] }, 2],
  [{ opponentIds: ['opponent', 'second'] }, 3],
  [{ opponentIds: ['opponent'], allyId: 'ally' }, 3],
  [{ opponentIds: ['opponent', 'second'], allyId: 'ally' }, 4],
  [{ opponentIds: ['opponent'], guestNames: ['Alex'], allyId: 'ally' }, 4],
])('counts the named players after battle creation for %j', async (players, count) => {
  await invokeCreate({ data: createBattleSchema.parse({ ...players, limit: 2000, casual: true }) })
  expect(mocks.capture.mock.calls).toEqual([
    [
      'actor',
      'battle_created',
      {
        delivery: 'direct',
        battle_id: 'battle-id',
        practice: false,
        limit: 2000,
        player_count: count,
        casual: true,
        manual: false,
        guests: expect.any(Number),
      },
    ],
  ])
})

it('does not report a battle created when the write fails', async () => {
  mocks.createBattle.mockRejectedValue(new Error('write failed'))
  await invokeCreate({ data: createBattleSchema.parse({ opponentId: 'opponent' }) }).catch(() => {})
  expect(mocks.capture).not.toHaveBeenCalled()
})

it.each(['appended', 'rejected'])('records the attempted setup step and its %s outcome without a battle token', async (outcome) => {
  mocks.submit.mockResolvedValue({ result: { outcome }, battleId: 'battle-id' })
  await invokeSubmit({
    data: submitSchema.parse({ token: 'private-battle', expectedSeq: 0, command: { kind: 'set-setup-step', step: 3 } }),
  })
  expect(mocks.capture.mock.calls).toEqual([
    [
      'actor',
      'battle_command_submitted',
      { battle_id: 'battle-id', command: 'set-setup-step', outcome, setup_step: 3, delivery: 'direct', duration_ms: expect.any(Number) },
    ],
  ])
})

it('keeps ordinary battle command payloads out of telemetry', async () => {
  await invokeSubmit({ data: submitSchema.parse({ token: 'private-battle', expectedSeq: 0, command: { kind: 'reset-setup' } }) })
  expect(mocks.capture.mock.calls).toEqual([
    [
      'actor',
      'battle_command_submitted',
      { battle_id: 'battle-id', command: 'reset-setup', outcome: 'appended', delivery: 'direct', duration_ms: expect.any(Number) },
    ],
  ])
})

it('records the refusal code but not its message for a refused command', async () => {
  mocks.submit.mockResolvedValue({
    result: { outcome: 'refused', code: 'stratagem-limit', reason: 'Grenade has been used this turn' },
    battleId: 'battle-id',
  })
  await invokeSubmit({ data: submitSchema.parse({ token: 'private-battle', expectedSeq: 0, command: { kind: 'reset-setup' } }) })
  expect(mocks.capture.mock.calls).toEqual([
    [
      'actor',
      'battle_command_submitted',
      {
        battle_id: 'battle-id',
        command: 'reset-setup',
        outcome: 'refused',
        reason: 'stratagem-limit',
        delivery: 'direct',
        duration_ms: expect.any(Number),
      },
    ],
  ])
})

it('reports no preset size for an automatically configured battle', async () => {
  await invokeCreate({ data: createBattleSchema.parse({ opponentId: 'opponent', limit: null, casual: true }) })
  expect(mocks.capture.mock.calls).toEqual([
    [
      'actor',
      'battle_created',
      { delivery: 'direct', battle_id: 'battle-id', practice: false, limit: null, player_count: 2, casual: true, manual: false, guests: 0 },
    ],
  ])
})

it('reports a manually tracked battle', async () => {
  await invokeCreate({ data: createBattleSchema.parse({ opponentId: 'opponent', casual: true, manual: true }) })
  expect(mocks.capture.mock.calls[0]?.[2]).toMatchObject({ manual: true })
})

it('answers a device with the battle history from the same submission', async () => {
  const answer = { result: { outcome: 'appended' }, screen: { kind: 'battle' }, workspace: { serverSeq: 3 } }
  mocks.submitWithWorkspace.mockResolvedValue(answer)
  const data = { ...submitSchema.parse({ token: 'private-battle', expectedSeq: 2, command: { kind: 'reset-setup' } }), workspace: true }
  expect({ answer: await invokeSubmit({ data }), plain: mocks.submit.mock.calls.length }).toEqual({ answer, plain: 0 })
})

it('reports how many guests a battle seats', async () => {
  await invokeCreate({ data: createBattleSchema.parse({ guestNames: ['Alex'], casual: true }) })
  expect(mocks.capture.mock.calls[0]?.[2]).toMatchObject({ guests: 1 })
})

it('reports nothing about a guest playing their own seat', async () => {
  mocks.actor.mockReturnValue('guest:battle:0')
  await invokeSubmit({
    data: submitSchema.parse({ token: 'private-battle', expectedSeq: 0, command: { kind: 'set-setup-step', step: 3 } }),
  })
  expect(mocks.capture).not.toHaveBeenCalled()
})

it('submits a guest command as the guest seat', async () => {
  mocks.actor.mockReturnValue('guest:battle:0')
  await invokeSubmit({
    data: submitSchema.parse({ token: 'private-battle', expectedSeq: 0, command: { kind: 'set-setup-step', step: 3 } }),
  })
  expect(mocks.submit.mock.calls[0]?.[1]).toBe('guest:battle:0')
})

it('keeps the battle id it reports out of the submission answer', async () => {
  const answer = await invokeSubmit({
    data: submitSchema.parse({ token: 'private-battle', expectedSeq: 0, command: { kind: 'reset-setup' } }),
  })
  expect(answer).toEqual({ result: { outcome: 'appended' } })
})

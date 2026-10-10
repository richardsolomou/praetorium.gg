import { beforeEach, expect, it, vi } from 'vitest'
import { syncBattleCommand } from './offline'
import { builtRoster } from '../../core/battle.fixtures'

const mocks = vi.hoisted(() => ({
  user: { id: 'actor', impersonatedBy: null as string | null },
  hasBattleOperation: vi.fn(),
  ownRoster: vi.fn(),
  submit: vi.fn(),
  battleWorkspace: vi.fn(),
  catalogueFor: vi.fn(),
}))
vi.mock('@tanstack/react-start', () => {
  const builder = () => ({ validator: () => builder(), handler: (handler: unknown) => handler })
  return { createServerFn: builder }
})
vi.mock('../rpc', () => ({ rpc: (work: () => unknown) => work(), mutationRpc: (work: () => unknown) => work() }))
vi.mock('../playerSession', () => ({ requireUser: async () => mocks.user }))
vi.mock('../app', () => ({
  app: () => ({ service: mocks, catalogueFor: mocks.catalogueFor, rulesFor: async () => null, battleReadRulesFor: async () => null }),
}))

const invoke = syncBattleCommand as unknown as (input: { data: Parameters<typeof syncBattleCommand>[0]['data'] }) => Promise<unknown>
function input() {
  const command = builtRoster('Saved army', ['Immortals'])
  if (command.kind !== 'attach-roster') throw new Error('Expected a roster fixture')
  return {
    owner: 'actor',
    operationId: crypto.randomUUID(),
    token: 'battle',
    expectedSeq: 1,
    recordedAt: 100,
    command: { ...command, roster: { ...command.roster, id: 'roster' } },
  }
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.user = { id: 'actor', impersonatedBy: null }
  mocks.hasBattleOperation.mockResolvedValue(false)
  mocks.submit.mockResolvedValue({ result: { outcome: 'appended', seq: 2 } })
  mocks.battleWorkspace.mockResolvedValue({ workspace: { serverSeq: 2 } })
})

it('retries an accepted captured roster after its source was deleted without recapturing it', async () => {
  mocks.hasBattleOperation.mockResolvedValue(true)
  const data = input()
  const result = await invoke({ data })
  expect({
    result,
    recaptured: mocks.ownRoster.mock.calls.length + mocks.catalogueFor.mock.calls.length,
    command: mocks.submit.mock.calls[0]?.[3],
  }).toEqual({ result: { outcome: 'applied', workspace: { serverSeq: 2 }, version: 2 }, recaptured: 0, command: data.command })
})
it('refuses a new captured roster attachment when the ownership evidence is missing', async () => {
  const result = await invoke({ data: input() })
  expect({ result, writes: mocks.submit.mock.calls.length }).toEqual({
    result: { outcome: 'refused', message: 'You do not own the captured roster.' },
    writes: 0,
  })
})
it('rejects a saved command from another account before accessing the battle', async () => {
  await expect(invoke({ data: { ...input(), owner: 'another-account' } })).rejects.toMatchObject({ status: 401 })
  expect(mocks.hasBattleOperation).not.toHaveBeenCalled()
})
it('rejects impersonated saved commands before accessing the battle', async () => {
  mocks.user.impersonatedBy = 'administrator'
  await expect(invoke({ data: input() })).rejects.toMatchObject({ status: 401 })
  expect(mocks.hasBattleOperation).not.toHaveBeenCalled()
})
it('retains a stale local battle branch as a conflict instead of claiming an acknowledgement', async () => {
  mocks.hasBattleOperation.mockResolvedValue(true)
  mocks.submit.mockResolvedValue({ result: { outcome: 'stale', seq: 3 } })
  const result = await invoke({ data: input() })
  expect({ result, reads: mocks.battleWorkspace.mock.calls.length }).toEqual({
    result: {
      outcome: 'conflict',
      message: 'Another device advanced this battle. Your offline history is saved; review both histories before continuing.',
    },
    reads: 0,
  })
})

it('records the version of the downloaded workspace when another command arrived after acknowledgement', async () => {
  mocks.hasBattleOperation.mockResolvedValue(true)
  mocks.battleWorkspace.mockResolvedValue({ workspace: { serverSeq: 5 } })
  expect(await invoke({ data: input() })).toEqual({ outcome: 'applied', workspace: { serverSeq: 5 }, version: 5 })
})

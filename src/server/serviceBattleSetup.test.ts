import { expect, it, vi } from 'vitest'
import type { RepositoryPort } from './spacetimeRepository'
import { PraetoriumService } from './service'

function serviceRecordingCreation() {
  const createBattle = vi.fn()
  const repository = {
    namesByIds: vi.fn().mockResolvedValue(new Map([['opponent', 'Opponent']])),
    relationships: vi.fn().mockResolvedValue([]),
    practiceOpponents: vi.fn().mockResolvedValue([{ id: 'opponent', name: 'Opponent', image: null }]),
    createBattle,
  } as unknown as RepositoryPort
  const service = new PraetoriumService(
    repository,
    () => 0,
    () => 0,
  )
  return {
    service,
    created: () => createBattle.mock.calls[0]?.[0],
    initialCommand: () => createBattle.mock.calls[0]?.[0]?.initialCommands?.[0],
  }
}

it.each([undefined, null, 1000])('creates the initial format command atomically for preset %s', async (limit) => {
  const { service, initialCommand } = serviceRecordingCreation()
  await service.createBattle('actor', { opponentId: 'opponent', limit, missionPackId: null, casual: true })
  expect(initialCommand()).toEqual({
    kind: 'configure-battle',
    limit: limit ?? null,
    missionPackId: null,
    terrainLayoutId: null,
    twistId: null,
    teamBattle: false,
    playerCount: 2,
    clockLimitMinutes: null,
  })
})

it('creates a manually tracked battle without a mission pack', async () => {
  const { service, initialCommand } = serviceRecordingCreation()
  await service.createBattle('actor', { opponentId: 'opponent', missionPackId: 'pack', casual: true, manual: true })
  expect(initialCommand()).toMatchObject({ missionPackId: null, manual: true })
})

it('seats a guest the creator names without a friendship', async () => {
  const { service, created } = serviceRecordingCreation()
  await service.createBattle('actor', { guestNames: ['Alex'], missionPackId: null, casual: true })
  expect(created()).toMatchObject({ opponentIds: [], guestNames: ['Alex'] })
})

it('counts a guest among the players a battle seats', async () => {
  const { service, initialCommand } = serviceRecordingCreation()
  await service.createBattle('actor', { opponentId: 'opponent', guestNames: ['Alex'], missionPackId: null, casual: true })
  expect(initialCommand()).toMatchObject({ teamBattle: true, playerCount: 3 })
})

it('does not report a guest battle as practice', async () => {
  const { service } = serviceRecordingCreation()
  expect(await service.createBattle('actor', { guestNames: ['Alex'], missionPackId: null, casual: true })).toMatchObject({
    practice: false,
  })
})

it('refuses a battle with nobody across the table', async () => {
  const { service } = serviceRecordingCreation()
  await expect(service.createBattle('actor', { missionPackId: null, casual: true })).rejects.toMatchObject({ status: 400 })
})

function groupService(memberIds: string[]) {
  const createBattle = vi.fn()
  const repository = {
    namesByIds: vi.fn().mockResolvedValue(new Map([['stranger', 'Stranger']])),
    relationships: vi.fn().mockResolvedValue([]),
    practiceOpponents: vi.fn().mockResolvedValue([]),
    groupByToken: vi.fn().mockResolvedValue({
      id: 'group-id',
      token: 'group',
      ownerId: 'actor',
      members: memberIds.map((userId) => ({ userId, status: 'accepted', role: 'member', name: userId, image: null })),
    }),
    createBattle,
  } as unknown as RepositoryPort
  return {
    service: new PraetoriumService(
      repository,
      () => 0,
      () => 0,
    ),
    createBattle,
  }
}

it('starts a group game against a member who is not a friend', async () => {
  const { service, createBattle } = groupService(['actor', 'stranger'])
  await service.createBattle('actor', { opponentId: 'stranger', missionPackId: null, groupToken: 'group' })
  expect(createBattle.mock.calls[0]?.[0]?.initialCommands.at(-1)).toEqual({ kind: 'set-battle-club', clubId: 'group-id' })
})

it('refuses a group game against someone outside the group', async () => {
  const { service } = groupService(['actor'])
  await expect(service.createBattle('actor', { opponentId: 'stranger', missionPackId: null, groupToken: 'group' })).rejects.toMatchObject({
    status: 403,
  })
})

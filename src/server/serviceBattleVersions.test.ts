import { expect, it, vi } from 'vitest'
import { battleCard } from './battleCard.fixtures'
import { ALICE, BOB, builtRoster, log } from '../core/battle.fixtures'
import type { StandingFaction } from '../core/standings'
import { PraetoriumService } from './service'
import type { BattleHistory, RepositoryPort } from './spacetimeRepository'

it.each([{ id: 'preview', name: 'Custodes codex', status: 'preview' as const }, undefined])(
  'shows the rules version saved with a battle roster: %j',
  async (edition) => {
    const command = builtRoster('Custodes', ['Custodian Guard'])
    if (command.kind !== 'attach-roster' || !command.roster.built) throw new Error('Missing built roster fixture')
    command.roster.built.edition = edition
    const history: BattleHistory = {
      battle: { id: 'battle', token: 'token', createdAt: 0 },
      players: [
        { id: ALICE, name: 'Alice', image: null, colour: null, side: 0, automated: false },
        { id: BOB, name: 'Bob', image: null, colour: null, side: 1, automated: false },
      ],
      log: log([ALICE, command]),
    }
    const repository = {
      battlesByUser: vi.fn().mockResolvedValue({ battles: [battleCard(history)], nextCursor: null }),
      battleChanges: vi.fn().mockResolvedValue({ cursor: 0, battleIds: [] }),
      profilesByIds: vi.fn().mockResolvedValue(new Map()),
      practiceOpponents: vi.fn().mockResolvedValue([]),
    } as unknown as RepositoryPort
    const service = new PraetoriumService(
      repository,
      () => 0,
      () => 0,
    )
    const current: StandingFaction & { id: string } = {
      id: 'cat',
      slug: 'adeptus-custodes',
      displayName: 'Adeptus Custodes',
      icon: null,
      edition: { id: 'preview', name: 'Custodes codex', status: 'released' },
    }
    const answer = await service.battles(ALICE, undefined, undefined, [current])
    expect(answer.battles[0]?.factions[0]?.edition).toEqual(edition ?? null)
  },
)

it('names each listed battle by the version a device saves its copy at', async () => {
  const history: BattleHistory = {
    battle: { id: 'battle', token: 'token', createdAt: 0 },
    players: [
      { id: ALICE, name: 'Alice', image: null, colour: null, side: 0, automated: false },
      { id: BOB, name: 'Bob', image: null, colour: null, side: 1, automated: false },
    ],
    // A removed player's commands leave gaps, so the version is the last seq rather than the count.
    log: log([ALICE, builtRoster('Custodes', ['Custodian Guard'])], [BOB, builtRoster('Orks', ['Boyz'])]).map((entry, index) => ({
      ...entry,
      seq: index ? 7 : 3,
    })),
  }
  const repository = {
    battlesByUser: vi.fn().mockResolvedValue({ battles: [battleCard(history)], nextCursor: null }),
    battleHistoryByToken: vi.fn().mockResolvedValue(history),
    battleChanges: vi.fn().mockResolvedValue({ cursor: 0, battleIds: [] }),
    profilesByIds: vi.fn().mockResolvedValue(new Map()),
    practiceOpponents: vi.fn().mockResolvedValue([]),
  } as unknown as RepositoryPort
  const service = new PraetoriumService(
    repository,
    () => 0,
    () => 0,
  )
  const { workspace } = await service.battleWorkspace('token', ALICE)
  expect((await service.battles(ALICE)).battles[0]?.serverSeq).toBe(workspace.serverSeq)
})

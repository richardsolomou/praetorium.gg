import { expect, it, vi } from 'vitest'
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
        { id: ALICE, name: 'Alice', image: null, side: 0, automated: false },
        { id: BOB, name: 'Bob', image: null, side: 1, automated: false },
      ],
      log: log([ALICE, command]),
    }
    const repository = {
      battlesByUser: vi.fn().mockResolvedValue({ battles: [history], nextCursor: null }),
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

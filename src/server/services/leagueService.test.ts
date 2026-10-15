import { expect, it, vi } from 'vitest'
import type { Roster } from '../../core/battle'
import type { RepositoryPort } from '../spacetimeRepository'
import { LeagueService } from './leagueService'

it('refuses to seal a roster with a custom points budget before sealing anything', async () => {
  const submitLeagueRoster = vi.fn()
  const league = new LeagueService({ submitLeagueRoster } as Partial<RepositoryPort> as RepositoryPort, () => 1, { notify: vi.fn() })

  const refusal = await league
    .submitLeagueRoster('league', 'player', { id: 'roster', limit: 2000, pointsBudget: 1500, updatedAt: 1 }, {} as Roster)
    .catch((error: Response) => error)

  expect([(refusal as Response).status, submitLeagueRoster.mock.calls.length]).toEqual([409, 0])
})

it('tells a doubles player whose teammate already sealed the Warlord to remove theirs', async () => {
  const submitLeagueRoster = vi.fn().mockResolvedValue({ outcome: 'invalid-warlords', format: '2v2' })
  const league = new LeagueService({ submitLeagueRoster } as Partial<RepositoryPort> as RepositoryPort, () => 1, { notify: vi.fn() })
  const snapshot: Roster = {
    name: 'Army',
    text: 'Army',
    built: {
      catalogueId: 'army',
      revision: 'revision',
      limit: 1_000,
      detachment: 'Detachment',
      detachmentIds: ['detachment'],
      disposition: null,
      picks: [{ entryId: 'captain' }],
      units: [{ key: 'captain', entryId: 'captain', name: 'Captain', models: 1, points: 80, warlord: true, group: 'character' }],
    },
  }

  const refusal = await league
    .submitLeagueRoster('league', 'player', { id: 'roster', limit: 1_000, updatedAt: 1 }, snapshot)
    .catch((error: Response) => error.text())

  expect(refusal).toBe('Your teammate’s sealed list already has your team’s Warlord: remove this list’s Warlord')
})

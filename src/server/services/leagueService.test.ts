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

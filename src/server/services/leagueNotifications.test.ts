import { describe, expect, it, vi } from 'vitest'
import type { RepositoryPort } from '../spacetimeRepository'
import { LeagueService } from './leagueService'

function service(repository: Partial<RepositoryPort>) {
  const notify = vi.fn()
  return { league: new LeagueService(repository as RepositoryPort, () => 1, { notify }), notify }
}

describe('league notifications', () => {
  it('notifies the organizer only for a new pending request', async () => {
    const joinLeague = vi.fn().mockResolvedValueOnce({ status: 'pending', ownerId: 'owner' }).mockResolvedValueOnce('pending')
    const { league, notify } = service({ joinLeague })

    expect(await league.joinLeague('league', 'player', 'event')).toBe('pending')
    await league.joinLeague('league', 'player', 'event')

    expect(notify).toHaveBeenCalledExactlyOnceWith([
      { kind: 'league-entry-requested', actorId: 'player', recipientIds: ['owner'], leagueToken: 'league', eventToken: 'event' },
    ])
  })

  it('notifies a rejected entrant and a teammate whose roster was cleared', async () => {
    const { league, notify } = service({ moderateLeagueEntry: vi.fn().mockResolvedValue({ rejected: true, resealIds: ['teammate'] }) })

    await league.moderateLeagueEntry('league', 'owner', 'player', 'rejected', 'event')

    expect(notify).toHaveBeenCalledExactlyOnceWith([
      { kind: 'league-entry-rejected', actorId: 'owner', recipientIds: ['player'], leagueToken: 'league', eventToken: 'event' },
      { kind: 'league-roster-reseal', actorId: 'owner', recipientIds: ['teammate'], leagueToken: 'league', eventToken: 'event' },
    ])
  })

  it('does not repeat a rejection notice', async () => {
    const { league, notify } = service({ moderateLeagueEntry: vi.fn().mockResolvedValue({ rejected: false, resealIds: [] }) })

    await league.moderateLeagueEntry('league', 'owner', 'player', 'rejected', 'event')

    expect(notify).not.toHaveBeenCalled()
  })

  it('notifies only entrants whose sealed rosters were cleared by a role or team change', async () => {
    const { league, notify } = service({
      assignLeagueRosterRequirement: vi.fn().mockResolvedValue({ resealIds: ['player'] }),
      assignLeagueTeam: vi.fn().mockResolvedValue({ resealIds: ['player', 'former-teammate'] }),
    })

    await league.assignLeagueRosterRequirement('league', 'owner', 'player', 1_000, 'event')
    await league.assignLeagueTeam('league', 'owner', ['player', 'new-teammate'], 'event')

    expect(notify.mock.calls.map(([notices]) => notices[0].recipientIds)).toEqual([['player'], ['player', 'former-teammate']])
  })

  it('sends nothing when a role or team assignment leaves rosters intact', async () => {
    const { league, notify } = service({
      assignLeagueRosterRequirement: vi.fn().mockResolvedValue({ resealIds: [] }),
      assignLeagueTeam: vi.fn().mockResolvedValue({ resealIds: [] }),
    })

    await league.assignLeagueRosterRequirement('league', 'owner', 'player', 1_000)
    await league.assignLeagueTeam('league', 'owner', ['player', 'teammate'])

    expect(notify).not.toHaveBeenCalled()
  })

  it('accepts assignment results from the previous database module', async () => {
    const { league, notify } = service({
      assignLeagueRosterRequirement: vi.fn().mockResolvedValue('updated'),
      assignLeagueTeam: vi.fn().mockResolvedValue('updated'),
    })

    expect(await league.assignLeagueRosterRequirement('league', 'owner', 'player', 1_000)).toEqual({ requiredLimit: 1_000 })
    expect(await league.assignLeagueTeam('league', 'owner', ['player', 'teammate'])).toEqual({ teamSize: 2 })
    expect(notify).not.toHaveBeenCalled()
  })
})

import { describe, expect, it, vi } from 'vitest'
import type { RepositoryPort } from '../spacetimeRepository'
import { SealedEventService } from './sealedEventService'

function service(repository: Partial<RepositoryPort>) {
  const notify = vi.fn()
  return { sealedEvent: new SealedEventService(repository as RepositoryPort, () => 1, { notify }), notify }
}

describe('sealedEvent notifications', () => {
  it('notifies every organizer only for a new pending request', async () => {
    const joinSealedEvent = vi
      .fn()
      .mockResolvedValueOnce({ status: 'pending', organizerIds: ['owner', 'admin'] })
      .mockResolvedValueOnce('pending')
    const { sealedEvent, notify } = service({ joinSealedEvent })

    expect(await sealedEvent.joinSealedEvent('tournament', 'player', 'event')).toBe('pending')
    await sealedEvent.joinSealedEvent('tournament', 'player', 'event')

    expect(notify).toHaveBeenCalledExactlyOnceWith([
      {
        kind: 'sealed-event-entry-requested',
        actorId: 'player',
        recipientIds: ['owner', 'admin'],
        sealedEventToken: 'tournament',
        eventToken: 'event',
      },
    ])
  })

  it('notifies a rejected entrant and a teammate whose roster was cleared', async () => {
    const { sealedEvent, notify } = service({
      moderateSealedEventEntry: vi.fn().mockResolvedValue({ rejected: true, resealIds: ['teammate'] }),
    })

    await sealedEvent.moderateSealedEventEntry('tournament', 'owner', 'player', 'rejected', 'event')

    expect(notify).toHaveBeenCalledExactlyOnceWith([
      {
        kind: 'sealed-event-entry-rejected',
        actorId: 'owner',
        recipientIds: ['player'],
        sealedEventToken: 'tournament',
        eventToken: 'event',
      },
      {
        kind: 'sealed-event-roster-reseal',
        actorId: 'owner',
        recipientIds: ['teammate'],
        sealedEventToken: 'tournament',
        eventToken: 'event',
      },
    ])
  })

  it('does not repeat a rejection notice', async () => {
    const { sealedEvent, notify } = service({ moderateSealedEventEntry: vi.fn().mockResolvedValue({ rejected: false, resealIds: [] }) })

    await sealedEvent.moderateSealedEventEntry('tournament', 'owner', 'player', 'rejected', 'event')

    expect(notify).not.toHaveBeenCalled()
  })

  it('notifies only entrants whose sealed rosters were cleared by a role or team change', async () => {
    const { sealedEvent, notify } = service({
      assignSealedEventRosterRequirement: vi.fn().mockResolvedValue({ resealIds: ['player'] }),
      assignSealedEventTeam: vi.fn().mockResolvedValue({ resealIds: ['player', 'former-teammate'] }),
    })

    await sealedEvent.assignSealedEventRosterRequirement('tournament', 'owner', 'player', 1_000, 'event')
    await sealedEvent.assignSealedEventTeam('tournament', 'owner', ['player', 'new-teammate'], 'event')

    expect(notify.mock.calls.map(([notices]) => notices[0].recipientIds)).toEqual([['player'], ['player', 'former-teammate']])
  })

  it('sends nothing when a role or team assignment leaves rosters intact', async () => {
    const { sealedEvent, notify } = service({
      assignSealedEventRosterRequirement: vi.fn().mockResolvedValue({ resealIds: [] }),
      assignSealedEventTeam: vi.fn().mockResolvedValue({ resealIds: [] }),
    })

    await sealedEvent.assignSealedEventRosterRequirement('tournament', 'owner', 'player', 1_000)
    await sealedEvent.assignSealedEventTeam('tournament', 'owner', ['player', 'teammate'])

    expect(notify).not.toHaveBeenCalled()
  })

  it('accepts assignment results from the previous database module', async () => {
    const { sealedEvent, notify } = service({
      assignSealedEventRosterRequirement: vi.fn().mockResolvedValue('updated'),
      assignSealedEventTeam: vi.fn().mockResolvedValue('updated'),
    })

    expect(await sealedEvent.assignSealedEventRosterRequirement('tournament', 'owner', 'player', 1_000)).toEqual({ requiredLimit: 1_000 })
    expect(await sealedEvent.assignSealedEventTeam('tournament', 'owner', ['player', 'teammate'])).toEqual({ teamSize: 2 })
    expect(notify).not.toHaveBeenCalled()
  })
})

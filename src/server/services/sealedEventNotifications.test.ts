import { describe, expect, it, vi } from 'vitest'
import type { LoadedRules } from '../../shared/rules'
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

  describe('table battlefields', () => {
    const roster = (disposition: string, dispositions: string[] = [disposition]) =>
      JSON.stringify({
        name: 'Army',
        text: '',
        built: { catalogueId: 'c', revision: 'r', limit: 1000, detachment: 'd', disposition, dispositions, units: [] },
      })
    const players = [
      { userId: 'solo', teamId: null, teamDisposition: null, snapshot: roster('purge') },
      { userId: 'ally', teamId: 'pair', teamDisposition: 'recon', snapshot: roster('take', ['take', 'recon']) },
      { userId: 'partner', teamId: 'pair', teamDisposition: 'recon', snapshot: roster('recon') },
    ]
    const rules = {
      terrainLayouts: [
        { id: 'pair-pick', matchupId: 'purge-vs-recon', deploymentId: 'dawn', geometry: {} },
        { id: 'ally-list', matchupId: 'purge-vs-take', deploymentId: 'dawn', geometry: {} },
      ],
      missions: new Map(),
    } as unknown as LoadedRules
    const table = (overrides = {}) => ({
      sealedEventTable: vi.fn().mockResolvedValue({ format: '2v1', rosterLimit: 2000, revealed: true, players, ...overrides }),
      setSealedEventBattlefield: vi.fn().mockResolvedValue('set'),
    })

    it('reads a pair’s layouts from the card it sealed', async () => {
      const { sealedEvent } = service(table())
      const { options } = await sealedEvent.tableBattlefields('t', 'e', 0, 0, null, rules)
      expect(options).toEqual([{ patternId: 'dawn', terrainLayoutId: 'pair-pick' }])
    })

    it('offers nothing while a team event has more than two sides', async () => {
      const { sealedEvent } = service(table({ players: [...players, { ...players[0]!, userId: 'other' }] }))
      expect((await sealedEvent.tableBattlefields('t', 'e', 0, 0, null, rules)).options).toEqual([])
    })

    it('tells every player at the table, not the organizer', async () => {
      const { sealedEvent, notify } = service(table())
      await sealedEvent.setTableBattlefield('t', 'e', 'solo', 0, 0, null, 'roll', rules)
      expect(notify).toHaveBeenCalledExactlyOnceWith([
        {
          kind: 'sealed-event-battlefield-set',
          actorId: 'solo',
          recipientIds: ['solo', 'ally', 'partner'],
          sealedEventToken: 't',
          eventToken: 'e',
        },
      ])
    })

    it('tells the players when the battlefield is cleared', async () => {
      const { sealedEvent, notify } = service(table())
      await sealedEvent.setTableBattlefield('t', 'e', 'organizer', 0, 0, null, null, rules)
      expect(notify.mock.calls[0]![0][0].kind).toBe('sealed-event-battlefield-cleared')
    })
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

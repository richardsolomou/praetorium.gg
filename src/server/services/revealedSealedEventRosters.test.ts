import { describe, expect, it, vi } from 'vitest'
import type { Roster } from '../../core/battle'
import type { RepositoryPort } from '../spacetimeRepository'
import { SealedEventService } from './sealedEventService'

const sealed: Roster = {
  name: 'Army',
  text: 'Captain — 100',
  reminders: [
    {
      key: 'oath',
      ability: 'Oath of Moment',
      description: 'Private reminder',
      timings: [{ moment: 'turn-start', phase: null, turn: 'your-turn' }],
    },
  ],
  remindersEnabled: true,
  built: {
    catalogueId: 'cat',
    revision: 'rev',
    limit: 1000,
    detachment: null,
    disposition: null,
    picks: [{ entryId: 'captain', toggles: {}, note: 'Private pick note' }],
    units: [{ key: 'u0', name: 'Captain', points: 100, models: 1, note: 'Private unit note' }],
  },
}

function rosters(revealedAt: number | null) {
  const sealedRosters = vi.fn().mockResolvedValue({ revealedAt, rosters: [{ userId: 'ada', snapshot: JSON.stringify(sealed) }] })
  return new SealedEventService({ sealedRosters } as Partial<RepositoryPort> as RepositoryPort, () => 1, {
    notify: vi.fn(),
  }).revealedSealedEventRosters('tournament')
}

describe('revealed sealed event rosters', () => {
  it('gives no list before the reveal', async () => {
    expect(await rosters(null)).toEqual([])
  })

  it('leaves out the owner’s reminders and unit notes', async () => {
    expect(JSON.stringify(await rosters(1))).not.toMatch(/Private/)
  })
})

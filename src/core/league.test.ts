import { describe, expect, it } from 'vitest'
import {
  alliedLeagueRosterLimit,
  leagueTableShape,
  readsAlliedLeagueRoster,
  requiredLeagueRosterLimit,
  visibleLeagueEntries,
  type LeagueAllyEntry,
  type LeagueEntryView,
} from './league'

const entries: LeagueEntryView[] = [
  {
    userId: 'accepted',
    name: 'Accepted',
    image: null,
    status: 'accepted',
    joinedAt: 1,
    submitted: true,
    rosterName: 'Army',
    requiredLimit: 2_000,
    sealedLimit: 2_000,
    teamId: null,
  },
  {
    userId: 'pending',
    name: 'Pending',
    image: null,
    status: 'pending',
    joinedAt: 2,
    submitted: false,
    rosterName: null,
    requiredLimit: null,
    sealedLimit: null,
    teamId: null,
  },
  {
    userId: 'rejected',
    name: 'Rejected',
    image: null,
    status: 'rejected',
    joinedAt: 3,
    submitted: false,
    rosterName: null,
    requiredLimit: null,
    sealedLimit: null,
    teamId: null,
  },
]

it('treats a missing legacy format as 1v1', () => {
  expect(leagueTableShape(null)).toBe('1v1')
})

describe('visibleLeagueEntries', () => {
  it('shows only accepted entrants to a visitor', () => {
    expect(visibleLeagueEntries(entries, 'owner', null).map((entry) => entry.userId)).toEqual(['accepted'])
  })

  it('shows a player their own pending entry', () => {
    expect(visibleLeagueEntries(entries, 'owner', 'pending').map((entry) => entry.userId)).toEqual(['accepted', 'pending'])
  })

  it('shows every entry to the organizer', () => {
    expect(visibleLeagueEntries(entries, 'owner', 'owner')).toEqual(entries)
  })
})

describe('league roster requirements', () => {
  it('uses the event size for every 1v1 entrant', () => {
    expect(requiredLeagueRosterLimit('1v1', 600, null)).toBe(600)
  })

  it('uses the per-entry assignment for a 2v1 entrant', () => {
    expect(requiredLeagueRosterLimit('2v1', 2_000, 1_000)).toBe(1_000)
  })

  it('derives the allied size from the solo side total', () => {
    expect(alliedLeagueRosterLimit(2_000)).toBe(1_000)
  })

  it('requires a doubles pairing before deriving half the force size', () => {
    expect(requiredLeagueRosterLimit('2v2', 2_000, null, null)).toBeNull()
    expect(requiredLeagueRosterLimit('2v2', 2_000, 1_000, 'team-a')).toBe(1_000)
  })

  it('keeps legacy events unrestricted', () => {
    expect(requiredLeagueRosterLimit(null, null, null)).toBeNull()
  })
})

describe('readsAlliedLeagueRoster', () => {
  const ally = (userId: string, over: Partial<LeagueAllyEntry> = {}): LeagueAllyEntry => ({
    userId,
    status: 'accepted',
    requiredLimit: 1_000,
    teamId: null,
    ...over,
  })

  it('pairs a doubles entrant with the teammate the organizer gave them', () => {
    const reader = ally('alice', { teamId: 'team-a' })
    expect(readsAlliedLeagueRoster('2v2', 2_000, reader, ally('bob', { teamId: 'team-a' }))).toBe(true)
    expect(readsAlliedLeagueRoster('2v2', 2_000, reader, ally('carol', { teamId: 'team-b' }))).toBe(false)
  })

  it('withholds a doubles roster until the organizer has paired both readers', () => {
    expect(readsAlliedLeagueRoster('2v2', 2_000, ally('alice'), ally('bob'))).toBe(false)
  })

  it('joins every 2v1 allied entrant, who can never be seated against each other', () => {
    expect(readsAlliedLeagueRoster('2v1', 2_000, ally('bob'), ally('carol'))).toBe(true)
  })

  it('keeps the 2v1 solo roster away from the pair who will face it', () => {
    const solo = ally('alice', { requiredLimit: 2_000 })
    expect(readsAlliedLeagueRoster('2v1', 2_000, ally('bob'), solo)).toBe(false)
    expect(readsAlliedLeagueRoster('2v1', 2_000, solo, ally('bob'))).toBe(false)
  })

  it('waits for the 2v1 assignment that says which side an entrant is on', () => {
    expect(readsAlliedLeagueRoster('2v1', 2_000, ally('bob', { requiredLimit: null }), ally('carol'))).toBe(false)
  })

  it('gives a 1v1 entrant nothing, because anybody there could be the opponent', () => {
    expect(readsAlliedLeagueRoster('1v1', 2_000, ally('alice', { requiredLimit: 2_000 }), ally('bob', { requiredLimit: 2_000 }))).toBe(
      false,
    )
    expect(readsAlliedLeagueRoster(null, 2_000, ally('alice'), ally('bob'))).toBe(false)
  })

  it('is not a way to read your own sealed list, or to read one as a visitor', () => {
    expect(readsAlliedLeagueRoster('2v1', 2_000, ally('bob'), ally('bob'))).toBe(false)
    expect(readsAlliedLeagueRoster('2v1', 2_000, null, ally('bob'))).toBe(false)
  })

  it('ignores an ally who is not in the event yet', () => {
    expect(readsAlliedLeagueRoster('2v1', 2_000, ally('bob', { status: 'pending' }), ally('carol'))).toBe(false)
    expect(readsAlliedLeagueRoster('2v1', 2_000, ally('bob'), ally('carol', { status: 'rejected' }))).toBe(false)
  })
})

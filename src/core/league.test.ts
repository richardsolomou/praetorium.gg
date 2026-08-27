import { describe, expect, it } from 'vitest'
import { alliedLeagueRosterLimit, leagueTableShape, requiredLeagueRosterLimit, visibleLeagueEntries, type LeagueEntryView } from './league'

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

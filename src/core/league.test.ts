import { describe, expect, it } from 'vitest'
import { visibleLeagueEntries, type LeagueEntryView } from './league'

const entries: LeagueEntryView[] = [
  { userId: 'accepted', name: 'Accepted', image: null, status: 'accepted', joinedAt: 1, submitted: true, rosterName: 'Army' },
  { userId: 'pending', name: 'Pending', image: null, status: 'pending', joinedAt: 2, submitted: false, rosterName: null },
  { userId: 'rejected', name: 'Rejected', image: null, status: 'rejected', joinedAt: 3, submitted: false, rosterName: null },
]

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

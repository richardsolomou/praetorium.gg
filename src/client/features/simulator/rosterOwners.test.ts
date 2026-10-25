import { describe, expect, it } from 'vitest'
import { rosterOwner } from './rosterOwners'

const known = {
  me: { name: 'Ana', image: 'ana.png' },
  saved: [{ id: 'mine' }],
  friends: [{ roster: { id: 'theirs' }, owner: { name: 'Ben', image: 'ben.png' } }],
  leagues: [
    {
      leagueToken: 'league',
      leagueName: 'Doubles Open',
      eventToken: 'event',
      userId: 'cy',
      rosterName: 'Swarm',
      ownerName: 'Cy',
      ownerImage: null,
    },
  ],
}

describe('whose roster a simulator side comes from', () => {
  it('is the player for one of their own rosters', () => {
    expect(rosterOwner({ id: 'mine' }, known)).toEqual({ name: 'Ana', image: 'ana.png' })
  })

  it("is the friend for a friend's public roster", () => {
    expect(rosterOwner({ id: 'theirs' }, known)).toEqual({ name: 'Ben', image: 'ben.png' })
  })

  it("is the entrant for a friend's revealed league list", () => {
    expect(rosterOwner({ league: { token: 'league', eventToken: 'event', userId: 'cy' } }, known)).toEqual({ name: 'Cy', image: null })
  })

  it('is unknown for a roster opened by link or a catalogue unit', () => {
    expect([rosterOwner({ id: 'someone-elses' }, known), rosterOwner(undefined, known)]).toEqual([undefined, undefined])
  })
})

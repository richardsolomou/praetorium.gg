import { describe, expect, it } from 'vitest'
import type { Battle } from '../battles/battle'
import { homeWidget } from './homeWidget'

const battle = {
  token: 'abc',
  status: 'playing',
  round: 2,
  phase: 'shooting',
  players: ['Me', 'Ally', 'Foe', 'Other foe'],
  playerIds: ['me', 'ally', 'foe', 'other'],
  sides: [0, 0, 1, 1],
  armies: ['Gladius Spearhead', null, null, null],
} as unknown as Battle

const league = { groupToken: 'g', groupName: 'Sunday League', round: 3, opponent: 'Rival', deadline: 5_000, overdue: false }
const empty = { games: [], leagueGames: [], rostersDue: [], tournaments: [] }

describe('homeWidget', () => {
  it('names only the other side of a game', () => {
    expect(homeWidget('me', { ...empty, games: [battle] }, 0).items[0]?.title).toBe('Your game against Foe & Other foe')
  })

  it("names the player's own list beside the round", () => {
    expect(homeWidget('me', { ...empty, games: [battle] }, 0).items[0]?.detail).toBe('Gladius Spearhead · Round 2 · Shooting')
  })

  it('puts an overdue league game before a list an event needs', () => {
    const widget = homeWidget(
      'me',
      {
        ...empty,
        leagueGames: [league, { ...league, round: 2, overdue: true }],
        rostersDue: [{ token: 't', tournament: { name: 'Winter Open' }, group: null }],
      },
      0,
    )
    expect(widget.items.map((item) => item.kind)).toEqual(['league', 'roster', 'league'])
  })

  it('leaves out a tournament already asking for its list', () => {
    const widget = homeWidget(
      'me',
      {
        ...empty,
        rostersDue: [{ token: 't', tournament: { name: 'Winter Open' }, group: null }],
        tournaments: [{ token: 't', name: 'Winter Open', playsAt: null, status: { label: 'Seal your roster', tint: '' } }],
      },
      0,
    )
    expect(widget.items).toHaveLength(1)
  })
})

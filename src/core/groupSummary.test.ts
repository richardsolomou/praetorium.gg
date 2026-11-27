import { describe, expect, it } from 'vitest'
import { groupSummary } from './groupSummary'
import type { StandingBattle } from './standings'

const army = (slug: string) => ({ slug, displayName: slug, icon: null })

const duel = (winner: string, loser: string, lastActivity: number, over: Partial<StandingBattle> = {}): StandingBattle => ({
  status: 'finished',
  playerIds: [winner, loser],
  players: [winner, loser],
  sides: [0, 1],
  scores: [60, 40],
  factions: [army('necrons'), army('custodes')],
  result: { concededBy: null },
  lastActivity,
  ...over,
})

const summary = (battles: StandingBattle[], members = ['alice', 'bob', 'cara']) =>
  groupSummary(battles, { members: new Set(members), exclude: [], now: 0 })

describe('groupSummary', () => {
  it('counts one army once whichever rules version each game used', () => {
    const versioned = { slug: 'legacy~adeptus-custodes', displayName: 'Adeptus Custodes', icon: null }
    const current = { slug: 'adeptus-custodes', displayName: 'Adeptus Custodes', icon: null }
    const factions = summary([
      duel('alice', 'bob', 1, { factions: [versioned, army('necrons')] }),
      duel('alice', 'bob', 2, { factions: [current, army('necrons')] }),
    ]).factions.map(({ faction, seats }) => [faction.displayName, seats])
    expect(factions).toEqual([
      ['Adeptus Custodes', 2],
      ['necrons', 2],
    ])
  })

  it('scores a head-to-head from each pair’s own side, whoever sat first', () => {
    const [rivalry] = summary([duel('alice', 'bob', 1), duel('bob', 'alice', 2), duel('bob', 'alice', 3)]).rivalries
    expect(rivalry).toMatchObject({ a: 'alice', b: 'bob', battles: 3, aWon: 1, bWon: 2 })
  })

  it('pairs only players on opposite sides of a team game', () => {
    const teams = duel('alice', 'bob', 1, {
      playerIds: ['alice', 'cara', 'bob'],
      players: ['a', 'c', 'b'],
      sides: [0, 0, 1],
      scores: [30, 30, 40],
    })
    expect(summary([teams]).rivalries.map(({ a, b }) => `${a}-${b}`)).toEqual(['alice-bob', 'bob-cara'])
  })

  it('leaves out a pair with someone no longer in the group', () => {
    expect(summary([duel('alice', 'dan', 1)]).rivalries).toEqual([])
  })

  it('leaves a battle untouched for over a week out of those in play', () => {
    const day = 24 * 60 * 60 * 1000
    const playing = (lastActivity: number) => duel('alice', 'bob', lastActivity, { status: 'playing' })
    const { live } = groupSummary([playing(10 * day - 8 * day), playing(10 * day - day)], {
      members: new Set(['alice', 'bob']),
      exclude: [],
      now: 10 * day,
    })
    expect(live).toBe(1)
  })

  it('lists form newest first', () => {
    expect(summary([duel('alice', 'bob', 1), duel('bob', 'alice', 2)]).form.alice).toEqual(['lost', 'won'])
  })
})

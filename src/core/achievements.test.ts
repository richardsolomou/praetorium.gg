import { describe, expect, it } from 'vitest'
import { achievements, type AchievementFacts } from './achievements'
import { guestSeatId } from './newBattle'
import type { StandingBattle } from './standings'

const won = (opponent: string, lastActivity: number, over: Partial<StandingBattle> = {}): StandingBattle => ({
  status: 'finished',
  playerIds: ['me', opponent],
  players: ['Me', opponent],
  sides: [0, 1],
  scores: [60, 40],
  factions: [null, null],
  result: { concededBy: null },
  lastActivity,
  ...over,
})
const lost = (opponent: string, lastActivity: number) => won(opponent, lastActivity, { scores: [40, 60] })

const facts = (over: Partial<AchievementFacts> = {}): AchievementFacts => ({
  battles: [],
  recruits: [],
  tournaments: [],
  clubs: [],
  photos: [],
  clubBattles: [],
  imports: [],
  seasons: [],
  seasonsRun: [],
  seals: [],
  published: [],
  collected: [],
  painted: 0,
  wishes: [],
  rosters: [],
  loans: [],
  friends: [],
  likesGiven: [],
  simulations: [],
  reminders: [],
  loadouts: [],
  favourites: [],
  app: [],
  ...over,
})
const earned = (over: Partial<AchievementFacts>, exclude: string[] = []) => achievements('me', facts(over), exclude).earned

describe('achievements', () => {
  it('ignores battles against a guest', () => {
    expect(earned({ battles: [won(guestSeatId('battle', 0), 1)] })['first-blood']).toBeUndefined()
  })

  it('ignores battles against a practice opponent', () => {
    expect(earned({ battles: [won('bot', 1)] }, ['bot'])['first-blood']).toBeUndefined()
  })

  it('dates a streak from the win that completes it, after a loss resets it', () => {
    const battles = [won('a', 1), won('b', 2), lost('c', 3), ...[4, 5, 6, 7, 8].map((at) => won('d', at))]
    expect(earned({ battles }).unbroken).toBe(8)
  })

  it('needs 10 likes on one photo, not across photos', () => {
    const likes = [1, 2, 3, 4, 5]
    expect(
      earned({
        photos: [
          { at: 0, likes },
          { at: 0, likes },
        ],
      }).admired,
    ).toBeUndefined()
  })

  it('makes a club founder once the club has both its members and its battles', () => {
    expect(earned({ clubs: [{ members: [1, 2, 3, 40], battles: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14] }] }).founder).toBe(40)
  })

  it('refuses a champion of a tournament smaller than 8', () => {
    const tournament = { entrants: 7, finishedAt: 1, organised: false, played: true, won: true }
    expect(earned({ tournaments: [tournament] }).champion).toBeUndefined()
  })

  it('counts a rivalry against one player, not across players', () => {
    const battles = Array.from({ length: 10 }, (_, at) => won(at % 2 ? 'a' : 'b', at))
    expect(earned({ battles })['old-rivals']).toBeUndefined()
  })

  it('does not count a conceded win as a close one', () => {
    const battle = won('a', 1, { scores: [41, 40], result: { concededBy: 'a' } })
    expect(earned({ battles: [battle] })['by-a-hair']).toBeUndefined()
  })

  it('counts a team win once a side has two players', () => {
    const battle = won('a', 1, { playerIds: ['me', 'ally', 'a', 'b'], sides: [0, 0, 1, 1], scores: [30, 30, 20, 20] })
    expect(earned({ battles: [battle] })['brothers-in-arms']).toBe(1)
  })

  it('adds up each earned tier', () => {
    expect(achievements('me', facts({ battles: [lost('a', 1)], recruits: [2] }), []).points).toBe(35)
  })
})

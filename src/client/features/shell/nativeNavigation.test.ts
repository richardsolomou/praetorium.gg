import { describe, expect, it } from 'vitest'
import { nativeNavigation } from './nativeNavigation'

describe('native application navigation', () => {
  it.each([
    ['/factions/adeptus-custodes/datasheets/allarus-custodians', '/factions/adeptus-custodes/datasheets?rules=custodes-11e'],
    ['/factions/adeptus-custodes/detachments/aquilan-shield', '/factions/adeptus-custodes?rules=custodes-11e'],
  ])('retains the rules version when returning from %s', (path, href) => {
    expect(nativeNavigation(path, { rules: 'custodes-11e' }).back).toBe(href)
  })
  it.each([
    ['/rosters', { section: 'rosters', title: 'Rosters' }],
    ['/battles', { section: 'battles', title: 'Battles' }],
    ['/factions', { section: 'factions', title: 'Factions' }],
    ['/', { section: 'home', title: 'Praetorium' }],
    ['/more', { title: 'More' }],
  ])('leaves %s without a back action, because it is the bottom of its tab', (path, expected) => {
    expect(nativeNavigation(path)).toEqual(expected)
  })

  it.each([
    ['/tournaments', 'events', 'Tournaments'],
    ['/clubs', 'events', 'Clubs'],
    ['/rules', 'rules', 'Rules'],
    ['/leaderboard', 'leaderboard', 'Leaderboard'],
    ['/missions', 'missions', 'Missions'],
    ['/force-dispositions', 'missions', 'Force dispositions'],
  ])('returns from %s to the More screen that lists it', (path, section, title) => {
    expect(nativeNavigation(path)).toEqual({ back: '/more', section, title })
  })

  it.each([
    ['/rosters', { section: 'rosters', title: 'Rosters' }],
    ['/rosters/army-id', { back: '/rosters', section: 'rosters', title: 'Roster' }],
    ['/battles/battle-id', { back: '/battles', section: 'battles', title: 'Battle' }],
    ['/tournaments/league-id', { back: '/tournaments', section: 'events', title: 'Tournament' }],
    ['/clubs/club-id/games/game-id', { back: '/clubs/club-id', section: 'events', title: 'Sealed game' }],
    ['/factions/necrons', { back: '/factions', section: 'factions', title: 'Faction' }],
    [
      '/missions/chapter-approved',
      {
        back: '/missions',
        section: 'missions',
        title: 'Mission pack',
      },
    ],
    ['/rules/core-rules', { back: '/rules', section: 'rules', title: 'Rules' }],
    ['/rules/core-rules/moving', { back: '/rules/core-rules', section: 'rules', title: 'Rules' }],
    [
      '/factions/necrons/datasheets/overlord',
      {
        back: '/factions/necrons/datasheets',
        section: 'factions',
        title: 'Datasheet',
      },
    ],
    [
      '/missions/chapter-approved/matchups/mission/disposition',
      {
        back: '/missions/chapter-approved',
        section: 'missions',
        title: 'Mission',
      },
    ],
    [
      '/missions/chapter-approved/secondaries/assassination',
      {
        back: '/missions/chapter-approved',
        section: 'missions',
        title: 'Secondary mission',
      },
    ],
    [
      '/force-dispositions/take-and-hold',
      {
        back: '/force-dispositions',
        section: 'missions',
        title: 'Force disposition',
      },
    ],
    ['/users/player-id', { back: '/', title: 'Profile' }],
    ['/support', { back: '/', title: 'Support' }],
    ['/privacy', { back: '/', title: 'Privacy' }],
    ['/sources', { back: '/', title: 'Data sources' }],
    ['/data-updates', { back: '/more', title: 'Data updates' }],
  ] as const)('maps %s to its stable app destination', (path, expected) => {
    expect(nativeNavigation(path)).toEqual(expected)
  })

  it('returns a shared roster to the battle or tournament that opened it', () => {
    expect(nativeNavigation('/rosters/roster-id', { battle: 'battle-token' }).back).toBe('/battles/battle-token')
    expect(nativeNavigation('/rosters/roster-id', { league: 'league-token', event: 'event-token' }).back).toBe(
      '/tournaments/league-token?event=event-token',
    )
  })
})

it('keeps the selected version in native reference Back destinations', () => {
  expect(nativeNavigation('/factions/adeptus-custodes/rules/custodes-11e/datasheets/allarus-custodians').back).toBe(
    '/factions/adeptus-custodes/rules/custodes-11e/datasheets',
  )
})

import { describe, expect, it } from 'vitest'
import { nativeNavigation } from './nativeNavigation'

describe('native application navigation', () => {
  it.each([
    ['/rosters', { section: 'rosters', title: 'Rosters' }],
    ['/battles', { section: 'battles', title: 'Battles' }],
    ['/leagues', { section: 'leagues', title: 'Leagues' }],
    ['/factions', { section: 'factions', title: 'Factions' }],
    ['/mission-packs', { section: 'missions', title: 'Mission packs' }],
  ])('leaves %s without a back action, because it is the bottom of its tab', (path, expected) => {
    expect(nativeNavigation(path)).toEqual(expected)
  })

  it.each([
    ['/rosters', { section: 'rosters', title: 'Rosters' }],
    [
      '/rosters/army-id',
      { back: { href: '/rosters', label: 'Back to rosters', preferHistory: true }, section: 'rosters', title: 'Roster' },
    ],
    [
      '/battles/battle-id',
      { back: { href: '/battles', label: 'Back to battles', preferHistory: true }, section: 'battles', title: 'Battle' },
    ],
    [
      '/leagues/league-id',
      { back: { href: '/leagues', label: 'Back to leagues', preferHistory: true }, section: 'leagues', title: 'League' },
    ],
    [
      '/factions/necrons',
      { back: { href: '/factions', label: 'Back to factions', preferHistory: true }, section: 'factions', title: 'Faction' },
    ],
    [
      '/mission-packs/chapter-approved',
      {
        back: { href: '/mission-packs', label: 'Back to mission packs', preferHistory: true },
        section: 'missions',
        title: 'Mission pack',
      },
    ],
    [
      '/factions/necrons/datasheets/overlord',
      {
        back: { href: '/factions/necrons/datasheets', label: 'Back to datasheets', preferHistory: true },
        section: 'factions',
        title: 'Datasheet',
      },
    ],
    [
      '/mission-matchups/chapter-approved/mission/disposition',
      {
        back: { href: '/mission-packs/chapter-approved', label: 'Back to mission pack', preferHistory: true },
        section: 'missions',
        title: 'Mission',
      },
    ],
    ['/users/player-id', { back: { href: '/', label: 'Back to home', preferHistory: true }, title: 'Profile' }],
    ['/support', { back: { href: '/', label: 'Back to home', preferHistory: true }, title: 'Support' }],
    ['/privacy', { back: { href: '/', label: 'Back to home', preferHistory: true }, title: 'Privacy' }],
    ['/sources', { back: { href: '/', label: 'Back to home', preferHistory: true }, title: 'Data sources' }],
  ] as const)('maps %s to its stable app destination', (path, expected) => {
    expect(nativeNavigation(path)).toEqual(expected)
  })

  it('returns a shared roster to the battle or league that opened it', () => {
    expect(nativeNavigation('/rosters/roster-id', { battle: 'battle-token' }).back).toEqual({
      href: '/battles/battle-token',
      label: 'Back to battle',
      preferHistory: true,
    })
    expect(nativeNavigation('/rosters/roster-id', { league: 'league-token', event: 'event-token' }).back).toEqual({
      href: '/leagues/league-token?event=event-token',
      label: 'Back to league',
      preferHistory: true,
    })
  })
})

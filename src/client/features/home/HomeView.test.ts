import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type PropsWithChildren } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { EMPTY_ONBOARDING_PROGRESS, type OnboardingTaskId } from '../../../core/onboarding'
import type { Battle } from '../battles/battle'
import type { ArmyUpdate } from './HomeArmyUpdates'
import type { HomeRecordData } from './HomeRecord'
import { type HomeData, HomeView } from './HomeView'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, 'aria-label': label }: PropsWithChildren<{ 'aria-label'?: string }>) =>
    createElement('a', { 'aria-label': label }, children),
}))

const player = { id: 'player', name: 'Alex' }

function render(props: Partial<HomeData> = {}) {
  const view = createElement(HomeView, {
    me: player,
    mine: [],
    friends: [],
    open: [],
    rosters: [],
    rosterCount: 0,
    rostersDue: [],
    friendRequests: 0,
    changedRosters: 0,
    armyUpdates: [],
    leaders: null,
    ...props,
  })
  return renderToStaticMarkup(createElement(QueryClientProvider, { client: new QueryClient() }, view))
}

const text = (markup: string) => markup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('home greeting', () => {
  it.each([
    ['an empty name', '', 'Welcome back'],
    ['a whitespace-only name', ' \t\n ', 'Welcome back'],
    ['a first name', 'Alex', 'Welcome back, Alex'],
    ['a full name with extra whitespace', '  Alex \t Smith  ', 'Welcome back, Alex'],
  ])('greets a returning player with %s', (_, name, greeting) => {
    expect(render({ me: { id: 'player', name }, rosterCount: 1 }).match(/<h1\b[^>]*>(.*?)<\/h1>/)?.[1]).toBe(greeting)
  })

  it('does not welcome a player back before they have a list or a game', () => {
    expect(render().match(/<h1\b[^>]*>(.*?)<\/h1>/)?.[1]).toBe('Welcome, Alex')
  })
})

const progress = (completedTasks: OnboardingTaskId[], skippedTasks: OnboardingTaskId[] = []) => ({
  ...EMPTY_ONBOARDING_PROGRESS,
  completedTasks,
  skippedTasks,
})

describe('home record', () => {
  const record = (rank: HomeRecordData['rank']): HomeRecordData => ({
    record: { battles: 12, won: 7, lost: 4, drawn: 1, rate: 0.625, currentStreak: 3 },
    rank,
  })
  const battled = (props: Partial<HomeData> = {}) => render({ onboarding: progress(['roster', 'battle']), ...props })

  it('holds the strip open while the record is folded', () => {
    expect(battled()).toContain('aria-label="Loading your record"')
  })

  it('shows no record to a player who has never sat in a battle', () => {
    expect(render({ onboarding: progress(['roster']), record: record(null) })).not.toContain('Win rate')
  })

  it('leaves the strip out when the record could not be read', () => {
    expect(battled({ record: null })).not.toContain('record')
  })

  it('says where the record starts before a battle has finished', () => {
    expect(text(battled({ record: { record: { ...record(null).record, battles: 0 }, rank: null } }))).toContain(
      'Your record starts with your first finished battle.',
    )
  })

  it('reads the record, win rate, streak and leaderboard place', () => {
    expect(text(battled({ record: record({ place: 4, of: 31 }) }))).toContain(
      'W · D · L 7 – 1 – 4 Win rate 63% Streak 3 wins Leaderboard #4 of 31',
    )
  })

  it('calls a player off the leaderboard unranked', () => {
    expect(text(battled({ record: record(null) }))).toContain('Leaderboard Unranked')
  })
})

describe('changed lists', () => {
  it('names the lists a data update changed', () => {
    expect(text(render({ changedRosters: 2 }))).toContain('2 lists changed by a data update')
  })

  it('says nothing when no list changed', () => {
    expect(render()).not.toContain('changed by a data update')
  })
})

describe('army updates', () => {
  const update = (slug: string, recordedAt: number): ArmyUpdate => ({
    faction: { slug, displayName: slug, icon: null },
    recordedAt,
    anchor: `update-${slug}`,
    changes: 4,
  })

  it('names the three most recently updated armies, newest first', () => {
    const markup = text(render({ armyUpdates: [update('orks', 1), update('necrons', 4), update('tyranids', 3), update('aeldari', 2)] }))
    expect(markup.match(/\b(orks|necrons|tyranids|aeldari)\b/g)).toEqual(['necrons', 'tyranids', 'aeldari'])
  })

  it('leaves the panel out when no army has an update', () => {
    expect(render()).not.toContain('Updates for your armies')
  })
})

describe('lists first', () => {
  it("leads with a player's lists when they have no games", () => {
    const markup = render({ onboarding: progress(['roster']) })
    expect(markup.indexOf('data-home-rosters')).toBeLessThan(markup.indexOf('<aside'))
  })
})

describe('battle rows', () => {
  const battle = (token: string, overrides: Partial<Battle> = {}) =>
    ({
      token,
      status: 'playing',
      round: 1,
      phase: 'command',
      players: ['Alex', `Opponent ${token}`],
      playerIds: ['player', `opponent-${token}`],
      armies: ['Orks', 'Necrons'],
      detachments: [[], []],
      scores: [0, 0],
      sides: [0, 1],
      deploymentId: null,
      lastActivity: Date.now(),
      settings: { limit: 2000 },
      ...overrides,
    }) as unknown as Battle

  it('leaves a game untouched for weeks off the home page', () => {
    expect(render({ mine: [battle('a', { lastActivity: 0 })] })).not.toContain('aria-label="Open ')
  })

  it('links to every battle when more games are in progress than shown', () => {
    expect(text(render({ mine: ['a', 'b', 'c'].map((token) => battle(token)) }))).toContain('All my battles')
  })

  it('names how a finished game went for the player', () => {
    expect(text(render({ mine: [battle('a', { status: 'finished', scores: [20, 50] })] }))).toMatch(/Games you have played 1 .*\bLost\b/)
  })

  it.each(['mine', 'friends', 'open'] as const)('lists at most two games from %s in feed order', (feed) => {
    const battles = Array.from({ length: 5 }, (_, index) => battle(String(index), { status: 'finished' }))
    expect(render({ [feed]: battles }).match(/aria-label="(?:Open|Watch) Alex versus Opponent \d+"/g)).toEqual([
      `aria-label="${feed === 'mine' ? 'Open' : 'Watch'} Alex versus Opponent 0"`,
      `aria-label="${feed === 'mine' ? 'Open' : 'Watch'} Alex versus Opponent 1"`,
    ])
  })

  it('shows no score before a game starts', () => {
    expect(text(render({ mine: [battle('a', { status: 'setup', scores: [3, 4] })] }))).not.toMatch(/\b3 – 4\b/)
  })

  it("marks the player's own seat", () => {
    const playerDetails = [
      { id: 'player', name: 'Alex', image: null, automated: false },
      { id: 'opponent-a', name: 'Opponent a', image: null, automated: false },
    ]
    expect(text(render({ mine: [battle('a', { playerDetails })] }))).toMatch(/Alex You .*Opponent a(?! You)/)
  })

  it('offers to watch a game the player is not sitting in', () => {
    expect(render({ open: [battle('a', { playerIds: ['someone', 'else'] })] })).toContain('aria-label="Watch Alex versus Opponent a"')
  })
})

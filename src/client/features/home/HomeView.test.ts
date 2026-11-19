import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type PropsWithChildren } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { EMPTY_ONBOARDING_PROGRESS, type OnboardingTaskId } from '../../../core/onboarding'
import type { Battle } from '../battles/battle'
import type { HomeGroup, HomeTournament } from './HomeGroups'
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
    changedRosters: new Set<string>(),
    rivals: [],
    groups: [],
    leagueGames: [],
    tournaments: [],
    leaders: null,
    ...props,
  })
  return renderToStaticMarkup(createElement(QueryClientProvider, { client: new QueryClient() }, view))
}

const text = (markup: string) => markup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

const heading = (markup: string) => text(markup.match(/<h1\b[^>]*>(.*?)<\/h1>/)?.[1] ?? '').trim()

describe('home greeting', () => {
  it.each([
    ['an empty name', '', 'Welcome back'],
    ['a whitespace-only name', ' \t\n ', 'Welcome back'],
    ['a first name', 'Alex', 'Welcome back, Alex'],
    ['a full name with extra whitespace', '  Alex \t Smith  ', 'Welcome back, Alex'],
  ])('greets a returning player with %s', (_, name, greeting) => {
    expect(heading(render({ me: { id: 'player', name }, rosterCount: 1 }))).toBe(greeting)
  })

  it('does not welcome a player back before they have a list or a game', () => {
    expect(heading(render())).toBe('Welcome, Alex')
  })
})

describe('starting a game', () => {
  const controls = { newBattle: createElement('button', null, 'New battle'), firstGame: createElement('button', null, 'Set up') }

  it('offers no way into setup before the player has a list or a game', () => {
    expect(text(render({ ...controls, onboarding: progress([]) }))).not.toMatch(/New battle|Set up/)
  })
})

describe('home app offer', () => {
  it('offers the app to a player who has not opened it lately', () => {
    expect(render()).toContain('data-app-band')
  })

  it('stops offering the app to a player who has', () => {
    expect(render({ me: { ...player, usesApp: true } })).not.toContain('data-app-band')
  })
})

const progress = (completedTasks: OnboardingTaskId[]) => ({ ...EMPTY_ONBOARDING_PROGRESS, completedTasks })

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
      'Record 7 – 1 – 4 Won 63% Streak 3 wins in a row Leaderboard #4 of 31',
    )
  })

  it('calls a player off the leaderboard unranked', () => {
    expect(text(battled({ record: record(null) }))).toContain('Leaderboard Unranked')
  })
})

describe('changed lists', () => {
  it('names the lists a data update changed', () => {
    expect(text(render({ changedRosters: new Set(['a', 'b']) }))).toContain('2 lists changed in a data update')
  })

  it('says nothing when no list changed', () => {
    expect(render()).not.toContain('changed in a data update')
  })
})

describe('rosters', () => {
  it("keeps a player's lists in the side column when they have no games", () => {
    const markup = render({ onboarding: progress(['roster']), rosterCount: 1 })
    expect(markup.indexOf('data-home-rosters')).toBeGreaterThan(markup.indexOf('<aside'))
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
    expect(text(render({ mine: [battle('a', { lastActivity: 0 })] }))).not.toContain('Opponent a')
  })

  it('counts the games in progress past the ones it shows', () => {
    expect(text(render({ mine: ['a', 'b', 'c'].map((token) => battle(token)) }))).toContain('1 more game in progress')
  })

  it('names how a finished game went for the player', () => {
    expect(text(render({ mine: [battle('a', { status: 'finished', scores: [20, 50] })] }))).toMatch(/Recent results .*\bLost\b/)
  })

  it.each([
    ['mine', 'finished'],
    ['friends', 'finished'],
    ['open', 'playing'],
  ] as const)('lists at most four games from %s in feed order', (feed, status) => {
    const battles = Array.from({ length: 6 }, (_, index) => battle(String(index), { status }))
    expect(text(render({ [feed]: battles })).match(/Opponent \d+/g)).toEqual(['Opponent 0', 'Opponent 1', 'Opponent 2', 'Opponent 3'])
  })

  it('leaves finished public games to the battles page', () => {
    expect(text(render({ open: [battle('a', { status: 'finished' })] }))).not.toContain('Opponent a')
  })

  it('shows no score before a game starts', () => {
    expect(text(render({ mine: [battle('a', { status: 'setup', scores: [3, 4] })] }))).not.toMatch(/\b3 – 4\b/)
  })

  it("marks the player's own seat", () => {
    const playerDetails = [
      { id: 'player', name: 'Alex', image: null, colour: null, automated: false },
      { id: 'opponent-a', name: 'Opponent a', image: null, colour: null, automated: false },
    ]
    expect(text(render({ mine: [battle('a', { playerDetails })] }))).toMatch(/Alex You .*Opponent a(?! You)/)
  })
})

describe('groups and tournaments', () => {
  const group = (name: string): HomeGroup => ({ token: name, name, battles: 3, lastBattleAt: null, pending: false })
  const tournament = (name: string): HomeTournament => ({
    token: name,
    name,
    playsAt: null,
    status: { label: 'Seal your roster', tint: 'text-discarded' },
  })

  it('keeps room for groups when the player has entered many tournaments', () => {
    const markup = text(render({ groups: [group('Garage')], tournaments: ['A', 'B', 'C', 'D', 'E'].map(tournament) }))
    expect(markup).toContain('Garage')
  })
})

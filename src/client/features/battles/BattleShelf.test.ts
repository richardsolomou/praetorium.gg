import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type PropsWithChildren } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { deploymentsQuery } from '../../queries'
import { BattleShelf } from './BattleShelf'
import type { Battle } from './battle'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: PropsWithChildren) => createElement('a', null, children),
}))

const dawnId = '97231123-f0ad-4b94-be0f-34582a31ea90'
const battle: Battle = {
  token: 'battle',
  createdAt: 0,
  lastActivity: 0,
  status: 'playing',
  round: 1,
  phase: 'command',
  players: ['Alice', 'Bob'],
  playerDetails: [],
  playerIds: ['alice', 'bob'],
  sides: [0, 1],
  armies: [null, null],
  factions: [null, null],
  detachments: [[], []],
  firstPlayerId: 'alice',
  primaries: [0, 0],
  secondaries: [0, 0],
  scores: [0, 0],
  mission: null,
  deploymentId: dawnId,
  settings: { limit: 1_000, missionPackId: null, terrainLayoutId: null, twistId: null, teamBattle: false, playerCount: 2 },
  result: null,
}

function render(overrides: Partial<Battle> = {}, loaded = true) {
  const client = new QueryClient()
  if (loaded)
    client.setQueryData(deploymentsQuery().queryKey, [
      { id: dawnId, name: 'Dawn Of War', description: null, zones: [], objectives: [] },
      { id: 'current-search-id', name: 'Search And Destroy', description: null, zones: [], objectives: [] },
    ])
  return renderToStaticMarkup(
    createElement(QueryClientProvider, { client }, createElement(BattleShelf, { battles: [{ ...battle, ...overrides }] })),
  ).replaceAll(/<[^>]+>/g, '')
}

describe('battle card battlefield label', () => {
  it('shows the published name for a UUID', () => {
    expect(render()).toContain('1000 pts · Dawn Of War')
  })

  it('shows the published name for an older slug', () => {
    expect(render({ deploymentId: 'search-and-destroy' })).toContain('1000 pts · Search And Destroy')
  })

  it.each([
    ['loading references', dawnId, false],
    ['an unknown deployment', 'missing-deployment', true],
    ['no deployment', null, true],
  ])('omits the battlefield when there is %s', (_, deploymentId, loaded) => {
    expect(render({ deploymentId }, loaded)).toMatch(/1000 ptsAAlice/)
  })

  it('does not repeat the finished status as completed', () => {
    expect(render({ status: 'finished', result: { concededBy: null, reason: 'completed' } })).not.toContain('completed')
  })

  it('keeps a concession visible', () => {
    expect(render({ status: 'finished', result: { concededBy: 'bob', reason: 'conceded' } })).toContain(' · conceded')
  })
})

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
  serverSeq: 0,
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
  organised: false,
}

function render(overrides: Partial<Battle> = {}, loaded = true, lead = false) {
  const client = new QueryClient()
  if (loaded)
    client.setQueryData(deploymentsQuery().queryKey, [
      { id: dawnId, name: 'Dawn Of War', description: null, zones: [], attackerTerritory: null, objectives: [] },
      { id: 'current-search-id', name: 'Search And Destroy', description: null, zones: [], attackerTerritory: null, objectives: [] },
    ])
  return renderToStaticMarkup(
    createElement(QueryClientProvider, { client }, createElement(BattleShelf, { battles: [{ ...battle, ...overrides }], lead })),
  ).replaceAll(/<[^>]+>/g, '')
}

// The lead plate carries the game's full setting; a row keeps to where the game is.
const mission = { name: 'Take and Hold' } as Battle['mission']
const plate = (overrides: Partial<Battle> = {}, loaded = true) => render({ mission, ...overrides }, loaded, true)

describe('lead plate battlefield label', () => {
  it('shows the published name for a UUID', () => {
    expect(plate()).toContain('1,000 points · Dawn Of War')
  })

  it('shows the published name for an older slug', () => {
    expect(plate({ deploymentId: 'search-and-destroy' })).toContain('1,000 points · Search And Destroy')
  })

  it.each([
    ['loading references', dawnId, false],
    ['an unknown deployment', 'missing-deployment', true],
    ['no deployment', null, true],
  ])('omits the battlefield when there is %s', (_, deploymentId, loaded) => {
    expect(plate({ deploymentId }, loaded)).not.toContain('Dawn Of War')
  })
})

describe('battle row', () => {
  it('names a live game in words', () => {
    expect(render()).toMatch(/^Live/)
  })

  it('leaves a concession to the result', () => {
    expect(render({ status: 'finished', result: { concededBy: 'bob', reason: 'conceded' } })).not.toContain('Conceded')
  })

  it('labels a battle finished early', () => {
    expect(render({ status: 'finished', result: { concededBy: null, reason: 'finished-early' } })).toContain('Finished early')
  })
})

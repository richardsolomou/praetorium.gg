import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { reduceBattle } from '../../../core/battle'
import { ALICE, BOB, log, NAMES, started } from '../../../core/battle.fixtures'
import { battleView } from '../../../core/battleView'
import type { Deployment, TerrainLayout } from '../../../contracts/terrain'
import { terrainReferencesQuery } from '../../queries'
import { BattlefieldFact } from './BattlefieldFact'

const deployment: Deployment = {
  id: 'deployment',
  name: 'Hammer and Anvil',
  description: null,
  zones: [],
  attackerTerritory: null,
  objectives: Array.from({ length: 5 }, (_, x) => ({ x, y: 22 })),
}

function render(count: number | null, linked = false, objectives = deployment.objectives) {
  const commands = log(...started())
  const view = battleView({ token: 'test' }, NAMES, reduceBattle([ALICE, BOB], commands), ALICE)
  view.settings.terrainLayoutId = 'layout'
  view.players[0]!.disposition = 'purge-the-foe'
  view.players[1]!.disposition = 'reconnaissance'
  const client = new QueryClient()
  if (count !== null) {
    const layout: TerrainLayout = {
      id: 'layout',
      name: 'Layout A',
      matchupId: 'purge-the-foe-vs-reconnaissance',
      variant: 1,
      deploymentId: deployment.id,
      description: null,
      pieces: [],
      geometry: {
        board: { width: 60, height: 44 },
        areas: Array.from({ length: count }, (_, x) => ({
          id: `area-${x}`,
          name: 'Terrain',
          points: [],
          markers: [],
          measurements: [],
          parts: [],
          group: null,
          objective: { position: { x, y: 22 }, group: linked && x < 2 ? 'center' : null },
        })),
      },
    }
    client.setQueryData(terrainReferencesQuery(['purge-the-foe-vs-reconnaissance', 'reconnaissance-vs-purge-the-foe']).queryKey, {
      layouts: [layout],
      templates: [],
    })
  }
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client },
      createElement(BattlefieldFact, { view, deployment: { ...deployment, objectives }, objectives: true }),
    ),
  ).replaceAll(/<[^>]+>/g, '')
}

it('counts all six objectives from the saved layout', () => {
  expect(render(6)).toBe('BattlefieldHammer and Anvil · 6 objectives')
})
it('counts an explicitly linked pair as one objective', () => {
  expect(render(6, true)).toBe('BattlefieldHammer and Anvil · 5 objectives')
})
it('uses deployment objectives when the layout has no objective areas', () => {
  expect(render(0)).toBe('BattlefieldHammer and Anvil · 5 objectives')
})
it('waits for the saved layout before showing an objective count', () => {
  expect(render(null)).toBe('BattlefieldHammer and Anvil')
})

it('shows a single source objective in the count', () => {
  expect(render(1)).toBe('BattlefieldHammer and Anvil · 1 objective')
})

it('shows zero when the saved battlefield has no objectives', () => {
  expect(render(0, false, [])).toBe('BattlefieldHammer and Anvil · 0 objectives')
})

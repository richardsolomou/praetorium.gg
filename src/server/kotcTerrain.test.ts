import { expect, it } from 'vitest'
import type { VsDataTerrain } from '../shared/vsData'
import { kotcTerrain } from './kotcTerrain'

const point = (x: number, y: number) => ({ x, y })
const provenance = (url: string) => ({ source: { url, pageUrl: 'https://example.com/format/' } })
const deployment = (id: string): VsDataTerrain => ({
  formatVersion: 1,
  kind: 'deployment-map',
  id,
  name: 'Arena',
  provenance: provenance('https://example.com/objectives.png'),
  board: { width: 36, height: 36 },
  zones: [
    { role: 'attacker', points: [point(36, 0), point(36, 36), point(28, 36), point(28, 0)] },
    { role: 'defender', points: [point(8, 0), point(8, 36), point(0, 36), point(0, 0)] },
  ],
  territories: [],
  objectives: [{ id: 'centre', at: point(18, 18) }],
})
const layout = (id: string, area: Partial<Extract<VsDataTerrain, { kind: 'terrain-layout' }>['areas'][number]> = {}): VsDataTerrain => ({
  formatVersion: 1,
  kind: 'terrain-layout',
  id,
  name: 'Arena',
  provenance: provenance('https://example.com/terrain.png'),
  board: { width: 36, height: 36 },
  deployments: [`deployment-${id}`],
  areas: [
    {
      id: 'ruin',
      name: 'North-east ruin',
      footprint: { at: point(10, 4), rotation: 90 },
      outline: [point(0, 0), point(4, 0), point(4, 2)],
      group: null,
      objective: null,
      parts: [
        {
          id: 'ruin-wall',
          name: 'Ruin',
          density: 'dense',
          at: point(1, 0),
          rotation: 90,
          mirror: true,
          roof: null,
          walls: [{ id: 'ruin-wall-1', points: [point(2, 1), point(0, 0)], thickness: 0.5 }],
        },
      ],
      measurements: [
        { from: point(0, 4), to: point(10, 4), approximate: false },
        { from: point(10, 0), to: point(10, 4), approximate: true },
      ],
      ...area,
    },
  ],
})
const both = (id: string) => [layout(id), deployment(`deployment-${id}`)]
const read = () => kotcTerrain(both('king-of-the-colosseum-2'))[0]!

it('reads the current Colosseum before the one it replaced', () => {
  expect(
    kotcTerrain([...both('king-of-the-colosseum-1'), ...both('king-of-the-colosseum-2')]).map((colosseum) => colosseum.layout.id),
  ).toEqual(['king-of-the-colosseum-2', 'king-of-the-colosseum-1'])
})

it('leaves out a Colosseum whose deployment map is missing', () => {
  expect(kotcTerrain([layout('king-of-the-colosseum-2')])).toEqual([])
})

it('turns an outline by its footprint’s rotation onto the board', () => {
  expect(read().layout.geometry!.areas[0]!.points).toEqual([point(10, 4), point(10, 8), point(8, 8)])
})

it('reflects a mirrored part across its own origin before turning and placing it', () => {
  expect(read().layout.geometry!.areas[0]!.parts[0]!.walls[0]!.points).toEqual([point(12, 4), point(10, 5)])
})

it('marks only the guides measured from a diagram as approximate', () => {
  expect(read().layout.geometry!.areas[0]!.measurements).toEqual([
    { from: point(0, 4), to: point(10, 4) },
    { from: point(10, 0), to: point(10, 4), approximate: true },
  ])
})

it('links the publisher’s diagrams and page', () => {
  const { publisherObjectiveUrl, publisherTerrainUrl, publisherUrl } = read().layout
  expect({ publisherObjectiveUrl, publisherTerrainUrl, publisherUrl }).toEqual({
    publisherObjectiveUrl: 'https://example.com/objectives.png',
    publisherTerrainUrl: 'https://example.com/terrain.png',
    publisherUrl: 'https://example.com/format/',
  })
})

it('describes the deployment depth the attacker’s zone runs to', () => {
  expect(read().deployment.description).toBe('8″ from each board edge on a 36″ square arena.')
})

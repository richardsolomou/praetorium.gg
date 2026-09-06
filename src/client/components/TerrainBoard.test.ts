import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { deploymentZoneClass, TerrainBoard } from './TerrainBoard'
import type { TerrainGeometry } from './terrainGeometry'

describe('deployment zone theme colors', () => {
  it('uses red for the attacker and green for the defender', () => {
    expect(deploymentZoneClass('attacker')).toBe('fill-side-a/20 stroke-side-a')
    expect(deploymentZoneClass('defender')).toBe('fill-side-b/20 stroke-side-b')
  })

  it('uses the primary green for a neutral zone', () => {
    expect(deploymentZoneClass('either')).toBe('fill-parchment/20 stroke-parchment')
  })
})

describe('terrain material colours', () => {
  it.each([false, true])('colours consecutive parts by material, including roofs (detailed: %s)', (detailed) => {
    const points = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
    ]
    const materials = ['dense', 'dense', 'light', 'light', 'unknown']
    const geometry: TerrainGeometry = {
      areas: [
        {
          id: 'area',
          name: 'Area',
          points,
          markers: [],
          objective: null,
          measurements: [],
          parts: materials.map((material, index) => ({
            id: `part-${index}`,
            name: `Part ${index}`,
            material,
            roof: points,
            walls: [{ id: `wall-${index}`, points, thickness: 0.5 }],
          })),
        },
      ],
    }
    const markup = renderToStaticMarkup(
      createElement(TerrainBoard, {
        layout: { name: 'Test layout', pieces: [], geometry },
        templates: [],
        detailed,
      }),
    )
    const parts = [...markup.matchAll(/<g class="([^"]+)"><polygon[^>]+><\/polygon><polyline[^>]+><title>Part \d<\/title>/g)]
    expect(parts.map((part) => part[1])).toEqual([
      'fill-achieved/20 stroke-achieved',
      'fill-achieved/20 stroke-achieved',
      'fill-discarded/20 stroke-discarded',
      'fill-discarded/20 stroke-discarded',
      'fill-bone/10 stroke-bone',
    ])
  })
})

const rectangle = (x: number, y: number, width: number, height: number) => [
  { x, y },
  { x: x + width, y },
  { x: x + width, y: y + height },
  { x, y: y + height },
]
const terrainArea = (id: string): TerrainGeometry['areas'][number] => ({
  id,
  name: id,
  points: rectangle(10, 10, 8, 6),
  markers: [],
  parts: [],
  objective: null,
  measurements: [],
})
function renderBoard(geometry: TerrainGeometry, detailed: boolean, flipped = false) {
  return renderToStaticMarkup(
    createElement(TerrainBoard, {
      layout: { name: 'Test layout', pieces: [], geometry },
      templates: [],
      detailed,
      deployment: {
        zones: [
          { name: 'Attacker', player: 'attacker', points: rectangle(flipped ? 0 : 45, 0, 10, 44) },
          { name: 'Defender', player: 'defender', points: rectangle(flipped ? 45 : 0, 0, 10, 44) },
        ],
        objectives: [{ x: 1, y: 1 }],
      },
    }),
  )
}

describe('source-backed battlefield annotations', () => {
  it.each([false, true])('shows the grouped unlettered objective, not lettered non-objectives (detailed: %s)', (detailed) => {
    const geometry: TerrainGeometry = {
      areas: [
        { ...terrainArea('lettered'), markers: [{ label: 'AB', position: { x: 12, y: 12 } }] },
        { ...terrainArea('left'), objective: { position: { x: 25, y: 20 }, group: 'center' } },
        { ...terrainArea('right'), objective: { position: { x: 35, y: 24 }, group: 'center' } },
      ],
    }
    const markup = renderBoard(geometry, detailed)
    expect(markup.match(/<title>Objective terrain<\/title>/g)).toHaveLength(1)
    expect(markup).toContain('translate(30 22) rotate(90)')
    expect(markup).not.toContain('translate(1 1)')
  })

  it('does not substitute deployment objectives when terrain has no objectives', () => {
    const markup = renderBoard({ areas: [terrainArea('area')] }, true)
    expect(markup).not.toContain('<title>Objective terrain</title>')
    expect(markup).not.toContain('translate(1 1)')
  })

  it.each([false, true])('keeps all placement references and their lengths when rotating the board (flipped: %s)', (flipped) => {
    const measurements = [
      { from: { x: 0, y: 10 }, to: { x: 18, y: 10 } },
      { from: { x: 18, y: 0 }, to: { x: 18, y: 10 } },
      { from: { x: 18, y: 44 }, to: { x: 18, y: 16.402 } },
    ]
    const markup = renderBoard({ areas: [{ ...terrainArea('area'), measurements: [...measurements, measurements[0]!] }] }, true, flipped)
    const rulers = [...markup.matchAll(/<line x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)"[^>]+marker-end=/g)]
    const coordinates = rulers.map((ruler) => ruler.slice(1).map(Number))
    expect(coordinates).toEqual(
      flipped
        ? [
            [34, 0, 34, 18],
            [44, 18, 34, 18],
            [0, 18, 27.598, 18],
          ]
        : [
            [10, 60, 10, 42],
            [0, 42, 10, 42],
            [44, 42, 16.402, 42],
          ],
    )
    expect(markup).toContain('>18″</text>')
    expect(markup).toContain('>10″</text>')
    expect(markup).toContain('>27.6″</text>')
  })

  it('keeps preview maps free of setup rulers', () => {
    const markup = renderBoard(
      { areas: [{ ...terrainArea('area'), measurements: [{ from: { x: 0, y: 10 }, to: { x: 18, y: 10 } }] }] },
      false,
    )
    expect(markup).not.toContain('marker-end=')
  })
})

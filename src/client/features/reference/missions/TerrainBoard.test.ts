import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TerrainBoard } from './TerrainBoard'
import type { TerrainGeometry } from './terrainGeometry'

const board = { width: 60, height: 44 }

describe('terrain areas', () => {
  const footprint = (id: string, x: number, group: string | null): TerrainGeometry['areas'][number] => ({
    id,
    name: id,
    points: [
      { x, y: 10 },
      { x: x + 4, y: 10 },
      { x: x + 4, y: 14 },
      { x, y: 14 },
    ],
    markers: [],
    objective: null,
    group,
    measurements: [],
    parts: [],
  })
  const outlines = (areas: TerrainGeometry['areas']) =>
    renderToStaticMarkup(
      createElement(TerrainBoard, { layout: { name: 'Test layout', pieces: [], geometry: { board, areas } }, templates: [] }),
    ).match(/<g class="stroke-azure"/g)?.length

  it('outlines footprints of one terrain area together', () => {
    expect(outlines([footprint('area-1', 10, 'area-1'), footprint('area-2', 14, 'area-1')])).toBe(1)
  })

  it('outlines touching terrain areas separately', () => {
    expect(outlines([footprint('area-1', 10, null), footprint('area-2', 14, null)])).toBe(2)
  })

  it.each([
    [true, 1],
    [false, 0],
  ])('marks joined footprints with an eye on the detailed board (detailed: %s)', (detailed, eyes) => {
    const markup = renderToStaticMarkup(
      createElement(TerrainBoard, {
        layout: {
          name: 'Test layout',
          pieces: [],
          geometry: { board, areas: [footprint('area-1', 10, 'area-1'), footprint('area-2', 14, 'area-1')] },
        },
        templates: [],
        detailed,
      }),
    )
    expect(markup.match(/<title>Footprints of one terrain area<\/title>/g)?.length ?? 0).toBe(eyes)
  })
})

it('draws a square board upright at its own size', () => {
  const markup = renderToStaticMarkup(
    createElement(TerrainBoard, {
      layout: { name: 'Colosseum', pieces: [], geometry: { board: { width: 36, height: 36 }, areas: [terrainArea('area')] } },
      templates: [],
    }),
  )
  expect(markup).toContain('viewBox="0 0 36 36"')
})

it('keeps both deployment measurements within a square board', () => {
  const geometry: TerrainGeometry = {
    board: { width: 36, height: 36 },
    areas: [
      {
        ...terrainArea('area'),
        measurements: [
          { from: { x: 36, y: 8 }, to: { x: 28, y: 8 } },
          { from: { x: 0, y: 28 }, to: { x: 8, y: 28 } },
        ],
      },
    ],
  }
  const markup = renderToStaticMarkup(
    createElement(TerrainBoard, { layout: { name: 'Colosseum', pieces: [], geometry }, templates: [], detailed: true }),
  )
  expect(
    [...markup.matchAll(/<line x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)"[^>]+marker-end=/g)].map((line) =>
      line.slice(1).map(Number),
    ),
  ).toEqual([
    [8, 0, 8, 8],
    [28, 36, 28, 28],
  ])
})

it('marks traced placement distances as approximate while preserving printed distances', () => {
  const markup = renderToStaticMarkup(
    createElement(TerrainBoard, {
      layout: {
        name: 'Colosseum',
        pieces: [],
        geometry: {
          board: { width: 36, height: 36 },
          areas: [
            {
              ...terrainArea('area'),
              measurements: [
                { from: { x: 36, y: 8 }, to: { x: 28, y: 8 } },
                { from: { x: 21.25, y: 0 }, to: { x: 21.25, y: 14.75 }, approximate: true },
              ],
            },
          ],
        },
      },
      templates: [],
      detailed: true,
    }),
  )
  expect([...markup.matchAll(/<text[^>]+>([^<]*″)<\/text>/g)].map((match) => match[1])).toEqual(['8″', '≈14¾″'])
})

it('says a traced layout places its pieces approximately', () => {
  const markup = renderToStaticMarkup(
    createElement(TerrainBoard, {
      layout: {
        name: 'Colosseum',
        pieces: [],
        geometry: { board: { width: 36, height: 36 }, areas: [] },
        publisherUrl: 'https://playontabletop.com/kotc/',
      },
      templates: [],
      detailed: true,
    }),
  )
  expect(markup).toContain('those positions are approximate')
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
  group: null,
  measurements: [],
})
function renderBoard(geometry: TerrainGeometry, detailed: boolean, flipped = false, objectives = [{ x: 1, y: 1 }]) {
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
        objectives,
      },
    }),
  )
}

describe('source-backed battlefield annotations', () => {
  it.each([false, true])('shows six independent layout objectives, including both central areas (detailed: %s)', (detailed) => {
    const positions = [
      { x: 25, y: 20 },
      { x: 35, y: 24 },
      { x: 12, y: 12 },
      { x: 48, y: 32 },
      { x: 25, y: 7 },
      { x: 35, y: 37 },
    ]
    const markup = renderBoard(
      {
        board,
        areas: positions.map((position, index) => ({ ...terrainArea(`area-${index}`), objective: { position, group: null } })),
      },
      detailed,
      false,
      [{ x: 30, y: 22 }],
    )
    expect(
      [...markup.matchAll(/<g transform="translate\(([^)]+)\) rotate\(90\)">[\s\S]*?<title>Objective terrain<\/title>/g)].map(
        (match) => match[1],
      ),
    ).toEqual(['25 20', '35 24', '12 12', '48 32', '25 7', '35 37'])
  })

  it.each([false, true])('shows the grouped unlettered objective, not lettered non-objectives (detailed: %s)', (detailed) => {
    const geometry: TerrainGeometry = {
      board,
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

  it('shows deployment objectives when terrain has no objectives', () => {
    const markup = renderBoard({ board, areas: [terrainArea('area')] }, true)
    expect(markup).not.toContain('<title>Objective terrain</title>')
    expect(markup).toContain('translate(1 1)')
  })

  it('distinguishes objective terrain from a 40 mm marker outside terrain', () => {
    const markup = renderBoard({ board, areas: [terrainArea('area')] }, true, false, [
      { x: 12, y: 12 },
      { x: 1, y: 1 },
    ])
    expect(markup).toContain('<title>Objective terrain</title>')
    expect(markup).toContain('<title>Objective marker outside terrain (40 mm)</title>')
    expect(markup).toContain('r="0.787"')
    expect(markup.match(/>OBJECTIVE<\/text>/g)).toHaveLength(2)
  })

  it('keeps distance labels clear of objective badges', () => {
    const geometry: TerrainGeometry = {
      board,
      areas: [
        {
          ...terrainArea('area'),
          measurements: [{ from: { x: 0, y: 33 }, to: { x: 14, y: 33 } }],
        },
      ],
    }
    const markup = renderBoard(geometry, true, false, [{ x: 14, y: 33 }])
    const label = markup.match(/<rect x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)" rx="\.14" class="fill-side-a"/)
    const [, x, y, width, height] = label ?? []
    expect(Number(x) < 34.08 && Number(x) + Number(width) > 31.92 && Number(y) < 47.28 && Number(y) + Number(height) > 46.78).toBe(false)
  })

  it('keeps distance labels clear of terrain labels', () => {
    const geometry: TerrainGeometry = {
      board,
      areas: [
        {
          ...terrainArea('area'),
          markers: [{ label: 'AB', position: { x: 12.3, y: 12 } }],
          measurements: [{ from: { x: 0, y: 12 }, to: { x: 14, y: 12 } }],
        },
      ],
    }
    const markup = renderBoard(geometry, true, false, [])
    const label = markup.match(/<rect x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)" rx="\.14" class="fill-side-a"/)
    const [, x, y, width, height] = label ?? []
    expect(Number(x) < 13.1 && Number(x) + Number(width) > 10.9 && Number(y) < 48.8 && Number(y) + Number(height) > 46.6).toBe(false)
  })

  it('does not repeat objectives already placed by the terrain source', () => {
    const markup = renderBoard({ board, areas: [{ ...terrainArea('area'), objective: { position: { x: 25, y: 20 }, group: null } }] }, true)
    expect(markup).toContain('<title>Objective terrain</title>')
    expect(markup).not.toContain('translate(1 1)')
  })

  it.each([false, true])('keeps all placement references and their lengths when rotating the board (flipped: %s)', (flipped) => {
    const measurements = [
      { from: { x: 0, y: 10 }, to: { x: 18, y: 10 } },
      { from: { x: 18, y: 0 }, to: { x: 18, y: 10 } },
      { from: { x: 18, y: 44 }, to: { x: 18, y: 16.402 } },
    ]
    const markup = renderBoard(
      { board, areas: [{ ...terrainArea('area'), measurements: [...measurements, measurements[0]!] }] },
      true,
      flipped,
    )
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
    expect(markup).toContain('>27⅝″</text>')
  })

  it('keeps preview maps free of setup rulers', () => {
    const markup = renderBoard(
      { board, areas: [{ ...terrainArea('area'), measurements: [{ from: { x: 0, y: 10 }, to: { x: 18, y: 10 } }] }] },
      false,
    )
    expect(markup).not.toContain('marker-end=')
  })
})

describe('deployment territories', () => {
  const westHalf = rectangle(0, 0, 30, 44)
  const render = (attackerTerritory: { x: number; y: number }[] | null) =>
    renderToStaticMarkup(
      createElement(TerrainBoard, {
        layout: { name: 'Test layout', pieces: [], geometry: { board, areas: [] } },
        templates: [],
        deployment: { zones: [], attackerTerritory, objectives: [] },
      }),
    )

  it('shades the attacker territory', () => {
    expect(render(westHalf)).toContain(
      `<polygon points="0,0 30,0 30,44 0,44" class="fill-side-a/10"><title>Attacker&#x27;s territory</title>`,
    )
  })

  it('shades the rest of the board as the defender territory', () => {
    expect(render(westHalf)).toContain(
      `<path d="M 0 0 H 60 V 44 H 0 Z M 0,0 30,0 30,44 0,44 Z" fill-rule="evenodd" class="fill-side-b/10"><title>Defender&#x27;s territory</title>`,
    )
  })

  it('dots the line where the territories meet', () => {
    expect(render(westHalf)).toContain(`<path d="M 30 0 L 30 44" fill="none" class="stroke-bone/60"`)
  })

  it('shades no territory when the deployment has none', () => {
    expect(render(null)).not.toContain('territory')
  })
})

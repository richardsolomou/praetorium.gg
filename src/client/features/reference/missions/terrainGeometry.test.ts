import { describe, expect, it } from 'vitest'
import type { Point } from './terrainGeometry'
import {
  deploymentNeedsFlip,
  footprintCorners,
  formatInches,
  objectiveNames,
  objectiveTerrainMarkers,
  placeMeasurementLabel,
  placementMeasurements,
  pointInPolygon,
  polygonCentroid,
  portraitPoint,
  terrainAreaJoins,
  terrainMarkerPosition,
  territoryBoundary,
  uniqueMeasurements,
} from './terrainGeometry'

const square = (x: number, y: number, size: number) => [
  { x, y },
  { x: x + size, y },
  { x: x + size, y: y + size },
  { x, y: y + size },
]

/** A terrain area with no walls or roof, so nothing blocks a marker. */
const openArea = (points: { x: number; y: number }[], markers: { label: string; position: { x: number; y: number } }[] = []) => ({
  id: 'area',
  name: 'Area',
  points,
  markers,
  objective: null,
  group: null,
  measurements: [],
  parts: [],
})

const board = { width: 60, height: 44 }

describe('reading a polygon', () => {
  it('takes the centroid of a square as its middle', () => {
    expect(polygonCentroid(square(0, 0, 10))).toEqual({ x: 5, y: 5 })
  })

  it('answers nothing for a shape with no points', () => {
    expect(polygonCentroid([])).toEqual({ x: 0, y: 0 })
  })

  it('knows a point inside from a point outside', () => {
    const shape = square(0, 0, 10)
    expect(pointInPolygon({ x: 5, y: 5 }, shape)).toBe(true)
    expect(pointInPolygon({ x: 15, y: 5 }, shape)).toBe(false)
  })
})

describe('turning the board for a narrow screen', () => {
  it('maps a landscape point onto its portrait place', () => {
    expect(portraitPoint({ x: 60, y: 0 }, false, board)).toEqual({ x: 0, y: 0 })
    expect(portraitPoint({ x: 0, y: 44 }, true, board)).toEqual({ x: 0, y: 0 })
    expect(portraitPoint({ x: 36, y: 8 }, false, { width: 36, height: 36 })).toEqual({ x: 8, y: 0 })
  })

  it('leaves the board alone when neither zone names a side', () => {
    const zones = [
      { player: 'either', name: 'Deployment', points: square(0, 0, 10) },
      { player: 'either', name: 'Deployment', points: square(40, 0, 10) },
    ]
    expect(deploymentNeedsFlip(zones, board)).toBe(false)
  })

  it('flips the board when the attacker would otherwise be drawn nearest the reader', () => {
    const near = { player: 'attacker', name: 'Attacker', points: square(0, 0, 10) }
    const far = { player: 'defender', name: 'Defender', points: square(45, 0, 10) }
    expect(deploymentNeedsFlip([near, far], board)).toBe(true)
    expect(deploymentNeedsFlip([far, near], board)).toBe(true)
    expect(
      deploymentNeedsFlip(
        [
          { ...near, points: square(45, 0, 10) },
          { ...far, points: square(0, 0, 10) },
        ],
        board,
      ),
    ).toBe(false)
  })
})

describe('placing a marker in a terrain area', () => {
  it('leaves a marker where the data put it when nothing is in the way', () => {
    const area = openArea(square(0, 0, 10), [{ label: 'AB', position: { x: 5, y: 5 } }])
    expect(terrainMarkerPosition(area, area.markers[0]!)).toEqual({ x: 5, y: 5 })
  })

  it('keeps a part label on a roof when it clears the surrounding walls', () => {
    const area = { ...openArea(square(0, 0, 10)), parts: [{ id: 'AB', name: 'AB', material: 'dense', roof: square(3, 3, 4), walls: [] }] }
    expect(terrainMarkerPosition(area, { label: 'AB', position: { x: 5, y: 5 } })).toEqual({ x: 5, y: 5 })
  })

  it('moves a marker that would sit outside its own area', () => {
    const area = openArea(square(0, 0, 10), [{ label: 'AB', position: { x: 50, y: 50 } }])
    // Nowhere near the area is open, so it falls back to the centre, which is.
    expect(terrainMarkerPosition(area, area.markers[0]!)).toEqual({ x: 5, y: 5 })
  })

  it('moves a terrain label rather than the source objective position', () => {
    const area = {
      ...openArea(square(0, 0, 10), [{ label: 'AB', position: { x: 5, y: 5 } }]),
      objective: { position: { x: 5, y: 5 }, group: null },
    }
    const placed = terrainMarkerPosition(area, area.markers[0]!)
    expect(Math.hypot(placed.x - 5, placed.y - 5)).toBeGreaterThanOrEqual(2.4)
    expect(objectiveTerrainMarkers({ board, areas: [area] })).toEqual([{ key: 'area', position: { x: 5, y: 5 } }])
  })

  it('keeps a terrain label clear of a deployment objective', () => {
    const area = openArea(square(0, 0, 10), [{ label: 'AB', position: { x: 5, y: 5 } }])
    const placed = terrainMarkerPosition(area, area.markers[0]!, [{ x: 5, y: 5 }])
    expect(Math.hypot(placed.x - 5, placed.y - 5)).toBeGreaterThanOrEqual(2.4)
  })

  it('searches along a narrow terrain area when cardinal positions collide with an objective', () => {
    const area = openArea(
      [
        { x: 1, y: 1.5 },
        { x: 1.5, y: 1 },
        { x: 9, y: 8.5 },
        { x: 8.5, y: 9 },
      ],
      [{ label: 'EF', position: { x: 5, y: 5 } }],
    )
    const placed = terrainMarkerPosition(area, area.markers[0]!, [{ x: 5, y: 5 }])
    expect(Math.hypot(placed.x - 5, placed.y - 5)).toBeGreaterThanOrEqual(2.4)
  })

  it('ignores letters when selecting objectives and keeps an unlettered objective', () => {
    const lettered = openArea(square(0, 0, 10), [{ label: 'AB', position: { x: 5, y: 5 } }])
    const unlettered = { ...openArea(square(20, 0, 10)), id: 'generator', objective: { position: { x: 26, y: 4 }, group: null } }
    expect(objectiveTerrainMarkers({ board, areas: [lettered, unlettered] })).toEqual([{ key: 'generator', position: { x: 26, y: 4 } }])
  })

  it('gives connected objective terrain one shared marker at the source positions’ midpoint', () => {
    const left = { ...openArea(square(20, 17, 5)), id: 'left', objective: { position: { x: 22, y: 20 }, group: 'center' } }
    const right = { ...openArea(square(35, 22, 5)), id: 'right', objective: { position: { x: 38, y: 24 }, group: 'center' } }
    expect(objectiveTerrainMarkers({ board, areas: [left, right] })).toEqual([{ key: 'group-center', position: { x: 30, y: 22 } }])
  })
})

describe('printing a measurement', () => {
  it('prints source distances to the nearest eighth inch', () => {
    expect(formatInches(6)).toBe('6\u2033')
    expect(formatInches(6.49)).toBe('6½\u2033')
    expect(formatInches(6.5)).toBe('6½\u2033')
    expect(formatInches(6.003)).toBe('6″')
    expect(formatInches(15.877)).toBe('15⅞″')
    expect(formatInches(0.875)).toBe('⅞″')
  })

  it('prints placement distances to the nearest half inch', () => {
    expect(formatInches(6.3, 2)).toBe('6½″')
  })
})

describe('placing measurement labels', () => {
  it('searches further along the ruler when nearby labels fill the usual positions', () => {
    const occupied = [{ left: 6, right: 14, top: 14, bottom: 20 }]
    const label = placeMeasurementLabel({ x: 10, y: 20 }, { x: 10, y: 0 }, true, '17″', occupied, board)
    expect(label).toEqual({ x: 10, y: 12.325 })
    expect(occupied).toHaveLength(2)
    expect(occupied[1]!.bottom).toBeLessThan(occupied[0]!.top)
  })

  it('reserves even a fallback label and keeps it inside the board', () => {
    const occupied = [{ left: 0, right: 44, top: 0, bottom: 60 }]
    placeMeasurementLabel({ x: 0, y: 0 }, { x: 0, y: 0 }, false, '0″', occupied, board)
    expect(occupied).toHaveLength(2)
    expect(occupied[1]!.left).toBeGreaterThanOrEqual(0)
    expect(occupied[1]!.top).toBeGreaterThanOrEqual(0)
  })
})

describe('dividing the board into territories', () => {
  it('draws only the edge between the territories', () => {
    expect(
      territoryBoundary(
        [
          { x: 0, y: 0 },
          { x: 26, y: 0 },
          { x: 34, y: 44 },
          { x: 0, y: 44 },
        ],
        board,
      ),
    ).toEqual([
      [
        { x: 26, y: 0 },
        { x: 34, y: 44 },
      ],
    ])
  })

  it('draws a stepped boundary as each of its edges', () => {
    expect(
      territoryBoundary(
        [
          { x: 0, y: 0 },
          { x: 20, y: 0 },
          { x: 20, y: 22 },
          { x: 30, y: 22 },
          { x: 30, y: 44 },
          { x: 0, y: 44 },
        ],
        board,
      ),
    ).toEqual([
      [
        { x: 20, y: 0 },
        { x: 20, y: 22 },
      ],
      [
        { x: 20, y: 22 },
        { x: 30, y: 22 },
      ],
      [
        { x: 30, y: 22 },
        { x: 30, y: 44 },
      ],
    ])
  })

  it('ignores a repeated closing corner', () => {
    expect(
      territoryBoundary(
        [
          { x: 0, y: 44 },
          { x: 0, y: 0 },
          { x: 60, y: 44 },
          { x: 0, y: 44 },
        ],
        board,
      ),
    ).toEqual([
      [
        { x: 0, y: 0 },
        { x: 60, y: 44 },
      ],
    ])
  })
})

describe('joining footprints into one terrain area', () => {
  const footprint = (id: string, points: { x: number; y: number }[], group: string | null) => ({ ...openArea(points), id, group })

  it('marks the middle of the edge two footprints share', () => {
    const geometry = { board, areas: [footprint('a', square(10, 10, 4), 'a'), footprint('b', square(14, 12, 4), 'a')] }
    expect(terrainAreaJoins(geometry)).toEqual([{ x: 14, y: 13 }])
  })

  it('slides a join along the shared edge out from under an objective marker', () => {
    const objective = { position: { x: 6, y: 3 }, group: 'a' }
    const areas = [
      { ...footprint('a', square(0, 0, 6), 'a'), objective },
      { ...footprint('b', square(6, 0, 6), 'a'), objective },
    ]
    const [join] = terrainAreaJoins({ board, areas })
    expect(join!.x === 6 && Math.abs(join!.y - 3) >= 2.4).toBe(true)
  })

  it('marks the shared diagonal of two triangles', () => {
    const left = [
      { x: 0, y: 0 },
      { x: 6, y: 0 },
      { x: 0, y: 4 },
    ]
    const right = [
      { x: 6, y: 4 },
      { x: 0, y: 4 },
      { x: 6, y: 0 },
    ]
    expect(terrainAreaJoins({ board, areas: [footprint('a', left, 'a'), footprint('b', right, 'a')] })).toEqual([{ x: 3, y: 2 }])
  })

  it('marks each touching pair in a chain once', () => {
    const areas = [footprint('a', square(0, 0, 4), 'a'), footprint('b', square(4, 0, 4), 'a'), footprint('c', square(8, 0, 4), 'a')]
    expect(terrainAreaJoins({ board, areas })).toEqual([
      { x: 4, y: 2 },
      { x: 8, y: 2 },
    ])
  })

  it('does not mark touching footprints of separate terrain areas', () => {
    expect(terrainAreaJoins({ board, areas: [footprint('a', square(0, 0, 4), null), footprint('b', square(4, 0, 4), null)] })).toEqual([])
  })

  it('marks between grouped footprints that do not touch', () => {
    expect(terrainAreaJoins({ board, areas: [footprint('a', square(0, 0, 4), 'a'), footprint('b', square(6, 0, 4), 'a')] })).toEqual([
      { x: 5, y: 2 },
    ])
  })
})

describe('placing terrain piece by piece', () => {
  it('reads a rectangle drawn as two triangles split along its diagonal as square to the board', () => {
    const corners = footprintCorners([
      [
        { x: 10, y: 10 },
        { x: 20, y: 10 },
        { x: 20, y: 16 },
      ],
      [
        { x: 10, y: 10 },
        { x: 20, y: 16 },
        { x: 10, y: 16 },
      ],
    ])
    expect(corners.tilted).toBe(false)
  })

  it('never measures to an objective inside terrain', () => {
    const geometry = { board, areas: [openArea(square(10, 10, 6))] }
    const ends = placementMeasurements(geometry, [{ x: 13, y: 13 }], [], { terrain: true }).map((measurement) => measurement.to)
    expect(ends).not.toContainEqual({ x: 13, y: 13 })
  })

  it('measures a later piece from corners of one already down', () => {
    const geometry = {
      board,
      areas: [
        { ...openArea(square(2, 2, 4)), id: 'first' },
        { ...openArea(square(9, 6, 3)), id: 'second' },
      ],
    }
    const froms = placementMeasurements(geometry, [], [], { terrain: true }).map((measurement) => measurement.from)
    expect(froms).toContainEqual({ x: 6, y: 2 })
  })

  it('skips corners whose distances fall between half inches', () => {
    const geometry = {
      board,
      areas: [
        { ...openArea(square(2, 2, 4)), id: 'first' },
        { ...openArea(square(9, 3, 4)), id: 'second' },
      ],
    }
    const froms = placementMeasurements(geometry, [], [], { terrain: true }).map((measurement) => measurement.from)
    expect(froms).not.toContainEqual({ x: 6, y: 2 })
  })

  it('measures from corners of a piece already down, never partway along a side', () => {
    const diamond = [
      { x: 5, y: 2 },
      { x: 8, y: 5 },
      { x: 5, y: 8 },
      { x: 2, y: 5 },
    ]
    const geometry = {
      board,
      areas: [
        { ...openArea(diamond), id: 'first' },
        { ...openArea(square(11, 3, 4)), id: 'second' },
      ],
    }
    const offsets = placementMeasurements(geometry, [], [], { terrain: true }).filter((measurement) => measurement.reference === 'terrain')
    const loose = offsets.filter(({ from }) => !diamond.some((corner) => corner.x === from.x && corner.y === from.y))
    expect(loose).toEqual([])
  })

  it('never measures along a piece’s own side', () => {
    const barrier = [
      { x: 2, y: 2 },
      { x: 8, y: 2 },
      { x: 8, y: 3 },
      { x: 2, y: 3 },
    ]
    const block = [
      { x: 8, y: 3 },
      { x: 9.5, y: 3 },
      { x: 9.5, y: 4.5 },
      { x: 8, y: 4.5 },
    ]
    const geometry = {
      board,
      areas: [
        { ...openArea(barrier), id: 'first' },
        { ...openArea(block), id: 'second' },
      ],
    }
    const froms = placementMeasurements(geometry, [], [], { terrain: true }).map((measurement) => measurement.from)
    expect(froms).not.toContainEqual({ x: 8, y: 3 })
  })

  it('keeps the step number when a published distance repeats a placement one', () => {
    const line = { from: { x: 0, y: 2 }, to: { x: 2, y: 2 }, approximate: false }
    expect(uniqueMeasurements([{ ...line, step: 1 }, line])).toEqual([{ ...line, step: 1 }])
  })
})

describe('naming objectives', () => {
  const hammerAndAnvil = [
    {
      player: 'defender',
      points: [
        { x: 0, y: 0 },
        { x: 18, y: 0 },
        { x: 18, y: 44 },
        { x: 0, y: 44 },
      ],
    },
    {
      player: 'attacker',
      points: [
        { x: 42, y: 0 },
        { x: 60, y: 0 },
        { x: 60, y: 44 },
        { x: 42, y: 44 },
      ],
    },
  ]
  const owners = (player: string) => (player === 'attacker' ? 'Ana' : 'Bo')
  const names = (objectives: Point[], viewer = 'attacker') => objectiveNames(hammerAndAnvil, objectives, viewer, owners)

  it('names an objective in a deployment zone after the zone owner', () => {
    expect(names([{ x: 10, y: 22 }])).toEqual(["Bo's home"])
  })

  it('names the objective between both zones the centre', () => {
    expect(names([{ x: 30, y: 22 }])).toEqual(['Centre'])
  })

  it('names an objective nearer one zone after its owner', () => {
    expect(names([{ x: 40, y: 8 }])).toEqual(["Ana's expansion"])
  })

  it('tells flanks apart from the chooser’s edge', () => {
    expect(
      names([
        { x: 30, y: 6 },
        { x: 30, y: 38 },
      ]),
    ).toEqual(["Ana's right flank", "Ana's left flank"])
  })

  it('turns left and right round for the other player', () => {
    expect(names([{ x: 30, y: 6 }], 'defender')).toEqual(["Bo's left flank"])
  })

  it('names a centre pair by the zone each is nearer', () => {
    expect(
      names([
        { x: 26, y: 22 },
        { x: 34, y: 22 },
      ]),
    ).toEqual(["Centre, Bo's side", "Centre, Ana's side"])
  })

  it('names a centre pair as near to both by side', () => {
    expect(
      names([
        { x: 30, y: 18 },
        { x: 30, y: 26 },
      ]),
    ).toEqual(["Centre, Ana's right", "Centre, Ana's left"])
  })

  it('numbers objectives without both deployment zones', () => {
    expect(objectiveNames([], [{ x: 30, y: 22 }], 'attacker', owners)).toEqual(['Objective 1'])
  })
})

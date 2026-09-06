import { describe, expect, it } from 'vitest'
import {
  deploymentNeedsFlip,
  formatInches,
  objectiveTerrainMarkers,
  placeMeasurementLabel,
  pointInPolygon,
  polygonCentroid,
  portraitPoint,
  svgPoints,
  terrainMarkerPosition,
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
  measurements: [],
  parts: [],
})

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

  it('writes points the way an SVG polygon reads them', () => {
    expect(
      svgPoints([
        { x: 1, y: 2 },
        { x: 3, y: 4 },
      ]),
    ).toBe('1,2 3,4')
  })
})

describe('turning the board for a narrow screen', () => {
  it('maps a landscape point onto its portrait place', () => {
    expect(portraitPoint({ x: 60, y: 0 }, false)).toEqual({ x: 0, y: 0 })
    expect(portraitPoint({ x: 0, y: 44 }, true)).toEqual({ x: 0, y: 0 })
  })

  it('leaves the board alone when neither zone names a side', () => {
    const zones = [
      { player: 'either', name: 'Deployment', points: square(0, 0, 10) },
      { player: 'either', name: 'Deployment', points: square(40, 0, 10) },
    ]
    expect(deploymentNeedsFlip(zones)).toBe(false)
  })

  it('flips the board when the attacker would otherwise be drawn nearest the reader', () => {
    const near = { player: 'attacker', name: 'Attacker', points: square(0, 0, 10) }
    const far = { player: 'defender', name: 'Defender', points: square(45, 0, 10) }
    expect(deploymentNeedsFlip([near, far])).toBe(true)
    expect(deploymentNeedsFlip([far, near])).toBe(true)
    expect(
      deploymentNeedsFlip([
        { ...near, points: square(45, 0, 10) },
        { ...far, points: square(0, 0, 10) },
      ]),
    ).toBe(false)
  })
})

describe('placing a marker in a terrain area', () => {
  it('leaves a marker where the data put it when nothing is in the way', () => {
    const area = openArea(square(0, 0, 10), [{ label: 'AB', position: { x: 5, y: 5 } }])
    expect(terrainMarkerPosition(area, area.markers[0]!)).toEqual({ x: 5, y: 5 })
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
    expect(objectiveTerrainMarkers({ areas: [area] })).toEqual([{ key: 'area', position: { x: 5, y: 5 } }])
  })

  it('ignores letters when selecting objectives and keeps an unlettered objective', () => {
    const lettered = openArea(square(0, 0, 10), [{ label: 'AB', position: { x: 5, y: 5 } }])
    const unlettered = { ...openArea(square(20, 0, 10)), id: 'generator', objective: { position: { x: 26, y: 4 }, group: null } }
    expect(objectiveTerrainMarkers({ areas: [lettered, unlettered] })).toEqual([{ key: 'generator', position: { x: 26, y: 4 } }])
  })

  it('gives connected objective terrain one shared marker at the source positions’ midpoint', () => {
    const left = { ...openArea(square(20, 17, 5)), id: 'left', objective: { position: { x: 22, y: 20 }, group: 'center' } }
    const right = { ...openArea(square(35, 22, 5)), id: 'right', objective: { position: { x: 38, y: 24 }, group: 'center' } }
    expect(objectiveTerrainMarkers({ areas: [left, right] })).toEqual([{ key: 'group-center', position: { x: 30, y: 22 } }])
  })
})

describe('printing a measurement', () => {
  it('prints placement guidance in whole inches', () => {
    expect(formatInches(6)).toBe('6\u2033')
    expect(formatInches(6.49)).toBe('6\u2033')
    expect(formatInches(6.5)).toBe('7\u2033')
    expect(formatInches(6.003)).toBe('6″')
  })
})

describe('placing measurement labels', () => {
  it('searches further along the ruler when nearby labels fill the usual positions', () => {
    const occupied = [{ left: 6, right: 14, top: 14, bottom: 20 }]
    const label = placeMeasurementLabel({ x: 10, y: 20 }, { x: 10, y: 0 }, true, '17″', occupied)
    expect(label).toEqual({ x: 10, y: 12.325 })
    expect(occupied).toHaveLength(2)
    expect(occupied[1]!.bottom).toBeLessThan(occupied[0]!.top)
  })

  it('reserves even a fallback label and keeps it inside the board', () => {
    const occupied = [{ left: 0, right: 44, top: 0, bottom: 60 }]
    placeMeasurementLabel({ x: 0, y: 0 }, { x: 0, y: 0 }, false, '0″', occupied)
    expect(occupied).toHaveLength(2)
    expect(occupied[1]!.left).toBeGreaterThanOrEqual(0)
    expect(occupied[1]!.top).toBeGreaterThanOrEqual(0)
  })
})

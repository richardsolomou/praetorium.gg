import { describe, expect, it } from 'vitest'
import {
  deploymentNeedsFlip,
  formatInches,
  objectiveTerrainMarkerPosition,
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
    expect(terrainMarkerPosition(area, area.markers[0])).toEqual({ x: 5, y: 5 })
  })

  it('moves a marker that would sit outside its own area', () => {
    const area = openArea(square(0, 0, 10), [{ label: 'AB', position: { x: 50, y: 50 } }])
    // Nowhere near the area is open, so it falls back to the centre, which is.
    expect(terrainMarkerPosition(area, area.markers[0])).toEqual({ x: 5, y: 5 })
  })

  it('keeps an objective marker clear of the terrain labels beside it', () => {
    const area = openArea(square(0, 0, 10), [{ label: 'AB', position: { x: 5, y: 5 } }])
    const placed = objectiveTerrainMarkerPosition(area)
    expect(Math.hypot(placed.x - 5, placed.y - 5)).toBeGreaterThanOrEqual(2.5)
  })

  it('puts an objective marker in the middle of an area with no labels', () => {
    expect(objectiveTerrainMarkerPosition(openArea(square(0, 0, 10)))).toEqual({ x: 5, y: 5 })
  })
})

describe('printing a measurement', () => {
  it('prints a whole number without a decimal, and a quarter with one', () => {
    expect(formatInches(6)).toBe('6\u2033')
    expect(formatInches(6.5)).toBe('6.5\u2033')
    expect(formatInches(6.25)).toBe('6.25\u2033')
  })

  it('rounds to the nearest quarter inch, which is what a tape measure reads', () => {
    expect(formatInches(6.1)).toBe('6\u2033')
    expect(formatInches(6.4)).toBe('6.5\u2033')
  })
})

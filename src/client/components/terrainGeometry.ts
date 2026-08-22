/**
 * The board as measurements rather than as pixels.
 *
 * Where a marker can sit without landing on a wall, where a measurement's label fits
 * without covering another, and which way round a deployment reads on a phone. None
 * of it draws anything, which is what makes it checkable.
 */

export type Point = { x: number; y: number }

export type TerrainPiece = {
  id: string
  name: string
  type: string
  templateId: string
  position: { x: number; y: number }
  rotation: number
  mirror: string | null
  parentAreaId: string | null
}

export type TerrainGeometry = {
  areas: {
    id: string
    name: string
    points: { x: number; y: number }[]
    markers: { label: string; position: { x: number; y: number } }[]
    parts: {
      id: string
      name: string
      material: string
      roof: { x: number; y: number }[] | null
      walls: { id: string; points: { x: number; y: number }[]; thickness: number }[]
    }[]
  }[]
}

export type TerrainTemplate = {
  id: string
  name: string
  kind: string
  points: { x: number; y: number }[]
  features?: {
    id: string
    templateId: string
    position: { x: number; y: number }
    rotation: number
    mirror: string | null
  }[]
}

export function objectiveTerrainMarkerPosition(area: TerrainGeometry['areas'][number]) {
  const centre = polygonCentroid(area.points)
  const terrainMarkers = area.markers.map((marker) => terrainMarkerPosition(area, marker))
  const offsets = [
    { x: 0, y: 0 },
    { x: 0, y: -3 },
    { x: 3, y: 0 },
    { x: 0, y: 3 },
    { x: -3, y: 0 },
    { x: 2.2, y: -2.2 },
    { x: 2.2, y: 2.2 },
    { x: -2.2, y: 2.2 },
    { x: -2.2, y: -2.2 },
  ]
  return (
    offsets
      .map((offset) => ({ x: centre.x + offset.x, y: centre.y + offset.y }))
      .find(
        (candidate) =>
          markerPositionIsOpen(area, candidate, 1.15) &&
          terrainMarkers.every((marker) => Math.hypot(candidate.x - marker.x, candidate.y - marker.y) >= 2.5),
      ) ?? centre
  )
}

export function terrainMarkerPosition(area: TerrainGeometry['areas'][number], marker: TerrainGeometry['areas'][number]['markers'][number]) {
  const centre = polygonCentroid(area.points)
  const offsets = [
    { x: 0, y: 0 },
    { x: 1.4, y: 0 },
    { x: -1.4, y: 0 },
    { x: 0, y: 1.4 },
    { x: 0, y: -1.4 },
    { x: 2.4, y: 0 },
    { x: -2.4, y: 0 },
    { x: 0, y: 2.4 },
    { x: 0, y: -2.4 },
  ]
  return (
    offsets
      .map((offset) => ({ x: marker.position.x + offset.x, y: marker.position.y + offset.y }))
      .find((candidate) => markerPositionIsOpen(area, candidate, 1.05)) ??
    (markerPositionIsOpen(area, centre, 1.05) ? centre : marker.position)
  )
}

function markerPositionIsOpen(area: TerrainGeometry['areas'][number], candidate: { x: number; y: number }, clearance: number) {
  if (!pointInPolygon(candidate, area.points)) return false
  if (area.parts.some((part) => part.roof?.length && pointInPolygon(candidate, part.roof))) return false
  return area.parts.every((part) =>
    part.walls.every((wall) =>
      wall.points.every((point, index) => {
        const next = wall.points[index + 1]
        return !next || pointToSegmentDistance(candidate, point, next) >= clearance + wall.thickness / 2
      }),
    ),
  )
}

function pointToSegmentDistance(point: { x: number; y: number }, start: { x: number; y: number }, end: { x: number; y: number }) {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  if (!lengthSquared) return Math.hypot(point.x - start.x, point.y - start.y)
  const amount = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared))
  return Math.hypot(point.x - (start.x + amount * dx), point.y - (start.y + amount * dy))
}

export function pointInPolygon(point: { x: number; y: number }, polygon: { x: number; y: number }[]) {
  if (polygon.length < 3) return false
  let inside = false
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const currentPoint = polygon[index]!
    const previousPoint = polygon[previous]!
    const crosses =
      currentPoint.y > point.y !== previousPoint.y > point.y &&
      point.x < ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) / (previousPoint.y - currentPoint.y) + currentPoint.x
    if (crosses) inside = !inside
  }
  return inside
}

export function svgPoints(points: { x: number; y: number }[]) {
  return points.map((point) => `${point.x},${point.y}`).join(' ')
}

export function measurementAnchor(points: { x: number; y: number }[], axis: 'x' | 'y', edge: number, otherEdge: number) {
  const perpendicular = axis === 'x' ? 'y' : 'x'
  const segments = points.flatMap((point, index) => {
    const next = points[(index + 1) % points.length]
    if (!next) return []
    const acrossEdge = Math.abs(next[axis] - point[axis])
    const alongEdge = Math.abs(next[perpendicular] - point[perpendicular])
    if (alongEdge < 0.5 || acrossEdge > Math.max(0.03, alongEdge * 0.03)) return []
    const anchor = Math.abs(point[perpendicular] - otherEdge) <= Math.abs(next[perpendicular] - otherEdge) ? point : next
    return [{ point: anchor }]
  })
  if (!segments.length) {
    const corners = points.filter((point, index) => {
      const previous = points[(index - 1 + points.length) % points.length]
      const next = points[(index + 1) % points.length]
      if (!previous || !next) return false
      return Math.hypot(point.x - previous.x, point.y - previous.y) >= 0.5 || Math.hypot(next.x - point.x, next.y - point.y) >= 0.5
    })
    const candidates = corners.length ? corners : points
    return candidates.toSorted((left, right) => measurementAnchorScore(left, axis, edge) - measurementAnchorScore(right, axis, edge))[0]
  }
  return segments.toSorted((left, right) => {
    const leftScore = measurementAnchorScore(left.point, axis, edge) + Math.abs(left.point[perpendicular] - otherEdge) * 0.02
    const rightScore = measurementAnchorScore(right.point, axis, edge) + Math.abs(right.point[perpendicular] - otherEdge) * 0.02
    return leftScore - rightScore
  })[0]?.point
}

function measurementAnchorScore(point: { x: number; y: number }, axis: 'x' | 'y', edge: number) {
  const value = Math.abs(point[axis] - edge)
  const wholeInchError = Math.abs(value - Math.round(value))
  return wholeInchError * 20 + value * 0.01
}

export type LabelBox = { left: number; right: number; top: number; bottom: number }

export function placeMeasurementLabel(
  arrow: { x: number; y: number },
  boardEdge: { x: number; y: number },
  vertical: boolean,
  text: string,
  occupied: LabelBox[],
) {
  const { width, height } = measurementLabelSize(text)
  const length = Math.hypot(boardEdge.x - arrow.x, boardEdge.y - arrow.y)
  const direction = length ? { x: (boardEdge.x - arrow.x) / length, y: (boardEdge.y - arrow.y) / length } : { x: 0, y: 0 }
  const perpendicular = { x: -direction.y, y: direction.x }
  const inlineDistance = (vertical ? height : width) / 2 + 1.05
  const offsets = [0, 0.9, -0.9, 1.8, -1.8].flatMap((sideways) =>
    [0, 1.5, 3].map((back) => ({
      x: direction.x * (inlineDistance + back) + perpendicular.x * sideways,
      y: direction.y * (inlineDistance + back) + perpendicular.y * sideways,
    })),
  )

  for (const offset of offsets) {
    const x = Math.min(44 - width / 2 - 0.25, Math.max(width / 2 + 0.25, arrow.x + offset.x))
    const y = Math.min(60 - height / 2 - 0.25, Math.max(height / 2 + 0.25, arrow.y + offset.y))
    const box = { left: x - width / 2, right: x + width / 2, top: y - height / 2, bottom: y + height / 2 }
    if (occupied.every((other) => !boxesOverlap(box, other))) {
      occupied.push(box)
      return { x, y }
    }
  }

  return {
    x: Math.min(44 - width / 2 - 0.25, Math.max(width / 2 + 0.25, arrow.x + direction.x * inlineDistance)),
    y: Math.min(60 - height / 2 - 0.25, Math.max(height / 2 + 0.25, arrow.y + direction.y * inlineDistance)),
  }
}

export function measurementLabelSize(text: string) {
  return { width: Math.max(2, text.length * 0.58), height: 1.25 }
}

function boxesOverlap(one: LabelBox, two: LabelBox) {
  const gap = 0.3
  return one.left < two.right + gap && one.right + gap > two.left && one.top < two.bottom + gap && one.bottom + gap > two.top
}

export function deploymentNeedsFlip(zones: { player: string; name: string; points: { x: number; y: number }[] }[]) {
  const attacker = zones.find((zone) => zone.player === 'attacker' || zone.name.toLowerCase().includes('attacker'))
  const defender = zones.find((zone) => zone.player === 'defender' || zone.name.toLowerCase().includes('defender'))
  if (!attacker || !defender) return false
  const red = portraitPoint(polygonCentroid(attacker.points), false)
  const blue = portraitPoint(polygonCentroid(defender.points), false)
  const horizontalSeparation = Math.abs(red.x - blue.x) > Math.abs(red.y - blue.y)
  return horizontalSeparation ? red.x > blue.x : red.y > blue.y
}

export function portraitPoint(point: { x: number; y: number }, flipped: boolean) {
  return flipped ? { x: 44 - point.y, y: point.x } : { x: point.y, y: 60 - point.x }
}

export function formatInches(value: number) {
  const rounded = Math.round(value * 4) / 4
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(2).replace(/0$/, '')}″`
}

export function polygonCentroid(points: { x: number; y: number }[]) {
  if (points.length < 3) return { x: 0, y: 0 }
  let signedArea = 0
  let x = 0
  let y = 0

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!
    const next = points[(index + 1) % points.length]!
    const cross = current.x * next.y - next.x * current.y
    signedArea += cross
    x += (current.x + next.x) * cross
    y += (current.y + next.y) * cross
  }

  if (Math.abs(signedArea) < Number.EPSILON) {
    return { x: 0, y: 0 }
  }

  return { x: x / (3 * signedArea), y: y / (3 * signedArea) }
}

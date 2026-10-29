/**
 * The board as measurements rather than as pixels.
 *
 * Where a marker can sit without landing on a wall, where a measurement's label fits
 * without covering another, and which way round a deployment reads on a phone. None
 * of it draws anything, which is what makes it checkable.
 */

import type { Point, TerrainGeometry } from '../../../../contracts/terrain'
import { groupBy } from '../../../../core/collections'

export type { Point, TerrainGeometry, TerrainPiece, TerrainTemplate } from '../../../../contracts/terrain'

/** How far a marker's centre keeps from an objective marker's so neither covers the other. */
const objectiveClearance = 2.4

const markerOffsets = Array.from({ length: 17 }, (_, x) => x - 8)
  .flatMap((x) => Array.from({ length: 17 }, (_, y) => ({ x: x / 2, y: (y - 8) / 2 })))
  .sort((left, right) => left.x * left.x + left.y * left.y - right.x * right.x - right.y * right.y)

export function objectiveTerrainMarkers(geometry: TerrainGeometry) {
  const objectives = geometry.areas.flatMap((area) => (area.objective ? [{ id: area.id, ...area.objective }] : []))
  return objectives.flatMap((objective, index) => {
    if (!objective.group) return [{ key: objective.id, position: objective.position }]
    if (objectives.findIndex((candidate) => candidate.group === objective.group) !== index) return []
    const group = objectives.filter((candidate) => candidate.group === objective.group)
    return [
      {
        key: `group-${objective.group}`,
        position: {
          x: group.reduce((total, candidate) => total + candidate.position.x, 0) / group.length,
          y: group.reduce((total, candidate) => total + candidate.position.y, 0) / group.length,
        },
      },
    ]
  })
}

/**
 * Where footprints of one terrain area meet: the point of each shared edge nearest its middle that an objective marker
 * does not cover, or between centres for a footprint touching none.
 */
export function terrainAreaJoins(geometry: TerrainGeometry) {
  const objectives = objectiveTerrainMarkers(geometry).map((objective) => objective.position)
  const groups = groupBy(
    geometry.areas.filter((area) => area.group),
    (area) => area.group,
  )
  const joins = new Map<string, Point>()
  const add = (point: Point) => joins.set(`${point.x}-${point.y}`, point)
  for (const footprints of groups.values()) {
    const touching = new Set<string>()
    footprints.forEach((one, index) => {
      for (const two of footprints.slice(index + 1)) {
        const join = sharedEdgeJoin(one.points, two.points, objectives)
        if (!join) continue
        add(join)
        touching.add(one.id).add(two.id)
      }
    })
    for (const lone of footprints.filter((footprint) => !touching.has(footprint.id))) {
      const centre = polygonCentroid(lone.points)
      const nearest = footprints
        .filter((footprint) => footprint !== lone)
        .map((footprint) => polygonCentroid(footprint.points))
        .sort((left, right) => Math.hypot(left.x - centre.x, left.y - centre.y) - Math.hypot(right.x - centre.x, right.y - centre.y))[0]
      if (nearest) add({ x: (centre.x + nearest.x) / 2, y: (centre.y + nearest.y) / 2 })
    }
  }
  return [...joins.values()]
}

/** The point nearest the middle of the longest edge two polygons share that clears every objective marker, or null when they share no edge. */
function sharedEdgeJoin(one: Point[], two: Point[], objectives: Point[]): Point | null {
  const tolerance = 0.05
  let best: { length: number; start: Point; direction: Point; from: number; to: number } | null = null
  for (const [start, end] of polygonEdges(one)) {
    const length = Math.hypot(end.x - start.x, end.y - start.y)
    if (!length) continue
    const direction = { x: (end.x - start.x) / length, y: (end.y - start.y) / length }
    for (const edge of polygonEdges(two)) {
      if (edge.some((point) => lineDistance(point, start, direction) > tolerance)) continue
      const [from, to] = edge
        .map((point) => (point.x - start.x) * direction.x + (point.y - start.y) * direction.y)
        .sort((left, right) => left - right) as [number, number]
      const overlap = Math.min(length, to) - Math.max(0, from)
      if (overlap <= tolerance || (best && best.length >= overlap)) continue
      best = { length: overlap, start, direction, from: Math.max(0, from), to: Math.min(length, to) }
    }
  }
  if (!best) return null
  const { start, direction, from, to } = best
  const at = (along: number) => ({ x: round(start.x + direction.x * along), y: round(start.y + direction.y * along) })
  const middle = (from + to) / 2
  const steps = Array.from({ length: Math.floor((to - from) / 0.25) + 1 }, (_, index) => (index % 2 ? 1 : -1) * Math.ceil(index / 2) * 0.25)
  const open = steps
    .map((step) => at(middle + step))
    .find((point) => objectives.every((objective) => Math.hypot(point.x - objective.x, point.y - objective.y) >= objectiveClearance))
  return open ?? at(middle)
}

function polygonEdges(points: Point[]) {
  return points.map((point, index) => [point, points[(index + 1) % points.length]!] as const)
}

function lineDistance(point: Point, start: Point, direction: Point) {
  return Math.abs((point.x - start.x) * direction.y - (point.y - start.y) * direction.x)
}

function round(value: number) {
  return Math.round(value * 1000) / 1000
}

export function deploymentObjectiveMarkers(geometry: TerrainGeometry | null, objectives: { x: number; y: number }[]) {
  if (geometry?.areas.some((area) => area.objective)) return []
  return objectives.map((position) => ({
    position,
    kind: !geometry ? 'unknown' : geometry.areas.some((area) => pointInPolygon(position, area.points)) ? 'terrain' : 'marker',
  }))
}

export function terrainMarkerPosition(
  area: TerrainGeometry['areas'][number],
  marker: TerrainGeometry['areas'][number]['markers'][number],
  objectives: { x: number; y: number }[] = [],
) {
  const centre = polygonCentroid(area.points)
  return (
    markerOffsets
      .map((offset) => ({ x: marker.position.x + offset.x, y: marker.position.y + offset.y }))
      .find((candidate) => markerPositionIsOpen(area, candidate, 1.05, objectives)) ??
    (markerPositionIsOpen(area, centre, 1.05, objectives) ? centre : marker.position)
  )
}

function markerPositionIsOpen(
  area: TerrainGeometry['areas'][number],
  candidate: { x: number; y: number },
  clearance: number,
  objectives: { x: number; y: number }[],
) {
  if (!pointInPolygon(candidate, area.points)) return false
  if (
    [...objectives, ...(area.objective ? [area.objective.position] : [])].some(
      (objective) => Math.hypot(candidate.x - objective.x, candidate.y - objective.y) < objectiveClearance,
    )
  )
    return false
  return area.parts.every((part) =>
    part.walls.every((wall) =>
      wall.points.every((point, index) => {
        const next = wall.points[index + 1]
        return !next || pointToSegmentDistance(candidate, point, next) >= clearance + wall.thickness / 2
      }),
    ),
  )
}

function pointToSegmentDistance(point: Point, start: Point, end: Point) {
  const nearest = nearestOnSegment(point, start, end)
  return Math.hypot(point.x - nearest.x, point.y - nearest.y)
}

function nearestOnSegment(point: Point, start: Point, end: Point) {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  const amount = lengthSquared ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared)) : 0
  return { x: start.x + amount * dx, y: start.y + amount * dy }
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

export type Measurement = TerrainGeometry['areas'][number]['measurements'][number] & {
  /** Read off the mat's printed edge ruler rather than drawn as an arrow. */
  ruler?: boolean
  /** On the first distance of each piece: its turn in the placement order. */
  step?: number
}

/** Beyond this, a distance to the board edge is read off the mat's edge ruler: an arrow that long crosses the others. */
const longestEdgeArrow = 12

/** The deployment zone edges that cross the board: the lines a mat prints. Territory boundaries are not printed. */
export function deploymentLines(deployment: { zones: { points: Point[] }[] }, board: TerrainGeometry['board']) {
  return deployment.zones.flatMap((zone) => territoryBoundary(zone.points, board))
}

/**
 * A placement order for the terrain and the fewest square-on distances that put down each piece in turn: two at one
 * outer corner, plus one at a second corner when the piece is tilted. Each distance runs to the nearest of the given
 * printed deployment lines, the board edge with `edges`, or the drawn edge of a piece already down with `terrain`.
 * A piece or marker that can't be fixed in both directions from what is enabled and already down is left out.
 * Objective markers outside terrain come last; one inside terrain lands wherever its terrain does, so it gets none.
 */
export function placementMeasurements(
  geometry: TerrainGeometry,
  objectives: Point[],
  lines: (readonly [Point, Point])[],
  { terrain, edges }: { terrain: boolean; edges: boolean },
): Measurement[] {
  const { board } = geometry
  const fixed = [
    ...lines,
    ...(edges
      ? polygonEdges([
          { x: 0, y: 0 },
          { x: board.width, y: 0 },
          { x: board.width, y: board.height },
          { x: 0, y: board.height },
        ])
      : []),
  ]
  const axisMeasurements = (point: Point, approximate: boolean, references: (readonly [Point, Point])[]) =>
    [
      [
        { x: 1, y: 0 },
        { x: -1, y: 0 },
      ],
      [
        { x: 0, y: 1 },
        { x: 0, y: -1 },
      ],
    ].flatMap((directions) => {
      const nearest = directions
        .flatMap((direction) => references.map(([start, end]) => rayHit(point, direction, start, end)))
        .filter((hit) => hit !== null)
        .sort((left, right) => left.distance - right.distance)[0]
      if (!nearest) return []
      const onEdge = [0, board.width].includes(nearest.at.x) || [0, board.height].includes(nearest.at.y)
      return [
        { from: nearest.at, to: point, approximate, distance: nearest.distance, ruler: onEdge && nearest.distance > longestEdgeArrow },
      ]
    })
  const total = (measurements: { distance: number }[]) => measurements.reduce((sum, measurement) => sum + measurement.distance, 0)
  const place = (corners: Point[], tilted: boolean, approximate: boolean, references: (readonly [Point, Point])[]) => {
    const [first, ...rest] = corners
      .map((corner) => axisMeasurements(corner, approximate, references))
      .filter((measurements) => measurements.length === 2)
      .sort((left, right) => total(left) - total(right))
    if (!first) return null
    const second = tilted ? rest.flat().sort((left, right) => left.distance - right.distance)[0] : undefined
    return [...first, ...(second ? [second] : [])]
  }

  const remaining = [...groupBy(geometry.areas, (area) => area.group ?? area.id).values()].map((areas) => ({
    approximate: areas.some((area) => area.measurements.some((measurement) => measurement.approximate)),
    footprints: areas.map((area) => area.points),
    ...footprintCorners(areas.map((area) => area.points)),
  }))
  const references = [...fixed]
  const steps: Measurement[][] = []
  while (remaining.length) {
    const next = remaining
      .map((piece, index) => ({ index, piece, measurements: place(piece.corners, piece.tilted, piece.approximate, references) }))
      .sort(
        (left, right) =>
          (left.measurements ? total(left.measurements) : Infinity) - (right.measurements ? total(right.measurements) : Infinity),
      )[0]!
    // Sorted last, so nothing left can be fixed in both directions from what is down.
    if (!next.measurements) break
    remaining.splice(next.index, 1)
    steps.push(next.measurements)
    if (terrain) references.push(...next.piece.footprints.flatMap((footprint) => polygonEdges(footprint)))
  }
  const markers = objectives
    .filter(
      (point) =>
        !geometry.areas.some(
          (area) =>
            pointInPolygon(point, area.points) ||
            polygonEdges(area.points).some(([start, end]) => pointToSegmentDistance(point, start, end) < 0.1),
        ),
    )
    .map((point) => axisMeasurements(point, false, references))
    .filter((measurements) => measurements.length === 2)
  return [...steps, ...markers].flatMap((measurements, index) =>
    measurements.map(({ from, to, approximate, ruler }, position) => ({
      from,
      to,
      approximate,
      ruler,
      ...(position ? {} : { step: index + 1 }),
    })),
  )
}

/**
 * A terrain area's four real corners: the outline points nearest the corners of the tightest rectangle around its
 * footprints. Outlines are hand-traced with wavy sides, so the tightest rectangle is what shows the piece's rotation.
 */
export function footprintCorners(footprints: Point[][]) {
  const points = footprints.flat()
  const box = (angle: number) => {
    const along = { x: Math.cos(angle), y: Math.sin(angle) }
    const projected = points.map((point) => ({ u: point.x * along.x + point.y * along.y, v: point.y * along.x - point.x * along.y }))
    const us = projected.map((point) => point.u)
    const vs = projected.map((point) => point.v)
    const [minU, maxU, minV, maxV] = [Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)]
    return {
      angle,
      projected,
      area: (maxU - minU) * (maxV - minV),
      corners: [minU, maxU].flatMap((u) => [minV, maxV].map((v) => ({ u, v }))),
    }
  }
  const angles = footprints
    .flatMap((footprint) => polygonEdges(footprint))
    .filter(([start, end]) => Math.hypot(end.x - start.x, end.y - start.y) > 1)
    .map(([start, end]) => ((Math.atan2(end.y - start.y, end.x - start.x) % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2))
  // Ties go to the squarer angle, so a footprint split along its diagonal still reads as the rectangle it is.
  const tightest = [0, ...angles]
    .map(box)
    .sort(
      (left, right) =>
        left.area - right.area || Math.min(left.angle, Math.PI / 2 - left.angle) - Math.min(right.angle, Math.PI / 2 - right.angle),
    )[0]!
  const corners = tightest.corners.map(
    (corner) =>
      points
        .map((point, index) => ({
          point,
          distance: Math.hypot(tightest.projected[index]!.u - corner.u, tightest.projected[index]!.v - corner.v),
        }))
        .sort((left, right) => left.distance - right.distance)[0]!.point,
  )
  const tilted = Math.min(tightest.angle, Math.PI / 2 - tightest.angle) > 0.01
  return { corners: [...new Map(corners.map((corner) => [`${corner.x}-${corner.y}`, corner])).values()], tilted }
}

/** Where a ray along a board axis first crosses a segment, or null when it misses or runs along it. */
function rayHit(origin: Point, direction: Point, start: Point, end: Point) {
  const along = direction.x ? 'x' : 'y'
  const across = direction.x ? 'y' : 'x'
  if (start[across] === end[across]) return null
  const amount = (origin[across] - start[across]) / (end[across] - start[across])
  if (amount < 0 || amount > 1) return null
  const hit = start[along] + amount * (end[along] - start[along])
  const distance = (hit - origin[along]) * direction[along]
  if (distance <= 0.05) return null
  return { distance, at: { ...origin, [along]: round(hit) } }
}

/** The edges of a territory that cross the board rather than run along its edge. */
export function territoryBoundary(territory: { x: number; y: number }[], board: TerrainGeometry['board']) {
  const onEdge = (start: { x: number; y: number }, end: { x: number; y: number }) =>
    [0, board.width].some((x) => start.x === x && end.x === x) || [0, board.height].some((y) => start.y === y && end.y === y)
  return territory
    .map((start, index) => [start, territory[(index + 1) % territory.length]!] as const)
    .filter(([start, end]) => !onEdge(start, end) && (start.x !== end.x || start.y !== end.y))
}

export function svgPoints(points: { x: number; y: number }[]) {
  return points.map((point) => `${point.x},${point.y}`).join(' ')
}

export type LabelBox = { left: number; right: number; top: number; bottom: number }

export function placeMeasurementLabel(
  arrow: { x: number; y: number },
  boardEdge: { x: number; y: number },
  vertical: boolean,
  text: string,
  occupied: LabelBox[],
  board: TerrainGeometry['board'],
) {
  const { width, height } = measurementLabelSize(text)
  const length = Math.hypot(boardEdge.x - arrow.x, boardEdge.y - arrow.y)
  const direction = length ? { x: (boardEdge.x - arrow.x) / length, y: (boardEdge.y - arrow.y) / length } : { x: 0, y: 0 }
  const perpendicular = { x: -direction.y, y: direction.x }
  const inlineDistance = (vertical ? height : width) / 2 + 1.05
  const offsets = [0, 0.9, -0.9, 1.8, -1.8]
    .flatMap((sideways) => [0, 1.5, 3, 4.5, 6].map((back) => ({ sideways, back })))
    .sort((left, right) => Math.hypot(left.sideways, left.back) - Math.hypot(right.sideways, right.back))
    .map(({ sideways, back }) => ({
      x: direction.x * (inlineDistance + back) + perpendicular.x * sideways,
      y: direction.y * (inlineDistance + back) + perpendicular.y * sideways,
    }))

  for (const offset of offsets) {
    const x = Math.min(board.height - width / 2 - 0.25, Math.max(width / 2 + 0.25, arrow.x + offset.x))
    const y = Math.min(board.width - height / 2 - 0.25, Math.max(height / 2 + 0.25, arrow.y + offset.y))
    const box = { left: x - width / 2, right: x + width / 2, top: y - height / 2, bottom: y + height / 2 }
    if (occupied.every((other) => !boxesOverlap(box, other))) {
      occupied.push(box)
      return { x, y }
    }
  }

  const x = Math.min(board.height - width / 2 - 0.25, Math.max(width / 2 + 0.25, arrow.x + direction.x * inlineDistance))
  const y = Math.min(board.width - height / 2 - 0.25, Math.max(height / 2 + 0.25, arrow.y + direction.y * inlineDistance))
  occupied.push({ left: x - width / 2, right: x + width / 2, top: y - height / 2, bottom: y + height / 2 })
  return { x, y }
}

export function measurementLabelSize(text: string) {
  return { width: Math.max(2, text.length * 0.58), height: 1.25 }
}

function boxesOverlap(one: LabelBox, two: LabelBox) {
  const gap = 0.3
  return one.left < two.right + gap && one.right + gap > two.left && one.top < two.bottom + gap && one.bottom + gap > two.top
}

export function deploymentNeedsFlip(
  zones: { player: string; name: string; points: { x: number; y: number }[] }[],
  board: TerrainGeometry['board'],
) {
  const attacker = zones.find((zone) => zone.player === 'attacker' || zone.name.toLowerCase().includes('attacker'))
  const defender = zones.find((zone) => zone.player === 'defender' || zone.name.toLowerCase().includes('defender'))
  if (!attacker || !defender) return false
  const red = portraitPoint(polygonCentroid(attacker.points), false, board)
  const blue = portraitPoint(polygonCentroid(defender.points), false, board)
  const horizontalSeparation = Math.abs(red.x - blue.x) > Math.abs(red.y - blue.y)
  return horizontalSeparation ? red.x > blue.x : red.y > blue.y
}

export function portraitPoint(point: { x: number; y: number }, flipped: boolean, board: TerrainGeometry['board']) {
  return flipped ? { x: board.height - point.y, y: point.x } : { x: point.y, y: board.width - point.x }
}

export function formatInches(value: number) {
  const eighths = Math.round(value * 8)
  const fraction = ['', '⅛', '¼', '⅜', '½', '⅝', '¾', '⅞'][eighths % 8]
  return `${Math.floor(eighths / 8)}${fraction}″`
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

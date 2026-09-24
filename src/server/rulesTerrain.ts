import fs from 'node:fs'
import path from 'node:path'
import { routeSlug } from '../core/slug'
import { compareText } from '../core/text'
import type { Deployment, Point, TerrainGeometry, TerrainLayout, TerrainTemplate } from '../contracts/terrain'
import { readOptionalList } from './rulesSource'

export type { Deployment, Point, TerrainGeometry, TerrainLayout, TerrainTemplate } from '../contracts/terrain'

/**
 * The battlefield, as polygons the interface can draw rather than words it must
 * describe.
 *
 * Three sources meet here: the deployment patterns and terrain layouts the mission
 * dataset ships, and the exact geometry Battlemaster publishes for a named layout.
 * A layout without its pinned geometry is reported as absent rather than guessed at,
 * because a battlefield drawn from the wrong measurements is worse than none.
 */

type RawPattern = {
  id: string
  name: string
  description?: string
  zones?: {
    player?: string
    name?: string
    color?: string
    position?: Point
    shape?: { points?: Point[]; width?: number; height?: number }
  }[]
  objectives?: Point[]
}

type RawTerrainLayout = {
  id: string
  name: string
  description?: string
  mission_matchup_id?: string
  variant?: number
  deployment_pattern_id?: string
  pieces?: {
    id: string
    name: string
    piece_type: string
    template: string
    position?: Point
    rotation_degrees?: number
    mirror?: string
    parent_area_id?: string
    is_objective?: boolean
    objective?: { position?: Point }
    objective_role?: string
    link_group?: string
    keystones?: { edge: string; ref: { kind: string; index?: number } }[]
  }[]
}

type RawTerrainTemplate = {
  id: string
  name: string
  kind: string
  footprint: { type: string; points?: Point[]; width?: number; height?: number }
  features?: {
    id: string
    template: string
    position?: Point
    rotation_degrees?: number
    mirror?: string
  }[]
}

type RawBattlemasterLayout = {
  layout?: { id?: string; links?: { page?: string } }
  terrain?: {
    id?: string
    name: string
    footprint: { origin: Point; widthIn: number; heightIn: number; rotationDeg: number }
    outline: { points: Point[] }
    parts: {
      id?: string
      name: string
      material: string
      hasRoof: boolean
      origin: Point
      rotationDeg: number
      mirroredX: boolean
      mirroredY: boolean
      outline: { points: Point[] } | null
      walls: { id?: string; points: Point[]; thicknessIn: number }[]
    }[]
  }[]
}
type RawBattlemasterTerrain = NonNullable<RawBattlemasterLayout['terrain']>[number]

type RawBattlemasterCatalog = {
  layouts?: { id?: string; owner?: string; ownerUsername?: string; name?: string }[]
}

/** The deployment patterns, with every zone's own offset already applied. */
export function loadDeployments(core: string): Deployment[] {
  return readOptionalList<RawPattern>(path.join(core, 'deployment-patterns.json'))
    .map((pattern) => ({
      id: pattern.id,
      name: pattern.name,
      description: pattern.description ?? null,
      zones: (pattern.zones ?? [])
        .filter((zone) => pointsOf(zone.shape).length > 2)
        .map((zone) => ({
          player: zone.player ?? 'either',
          name: zone.name ?? 'Deployment',
          colour: zone.color ?? '#8c9199',
          // A zone's points are relative to its own position, so the offset is
          // applied here: without it every zone piles up in one corner.
          points: pointsOf(zone.shape).map((point) => boardPoint(point.x + (zone.position?.x ?? 0), point.y + (zone.position?.y ?? 0))),
        })),
      objectives: pattern.objectives ?? [],
    }))
    .filter((pattern) => pattern.zones.length)
    .toSorted((left, right) => compareText(left.name, right.name))
}

/** Layouts without a matchup are skipped: nothing in the app can reach one. */
export function loadTerrainLayouts(core: string, battlemasterDirectory: string): TerrainLayout[] {
  const battlemasterIds = battlemasterLayoutIds(battlemasterDirectory)
  const templates = new Map(
    readOptionalList<RawTerrainTemplate>(path.join(core, 'terrain-templates.json')).map((template) => [template.id, template]),
  )
  return readOptionalList<RawTerrainLayout>(path.join(core, 'terrain-layouts.json'))
    .filter((layout) => layout.mission_matchup_id)
    .map((layout) => ({
      id: layout.id,
      name: layout.name,
      description: layout.description ?? null,
      matchupId: layout.mission_matchup_id!,
      variant: layout.variant ?? null,
      deploymentId: layout.deployment_pattern_id ?? null,
      geometry: battlemasterGeometry(battlemasterDirectory, battlemasterIds, layout.description, layout.pieces ?? [], templates),
      pieces: (layout.pieces ?? [])
        .filter((piece) => piece.position)
        .map((piece) => ({
          id: piece.id,
          name: piece.name,
          type: piece.piece_type,
          templateId: piece.template,
          position: piece.position!,
          rotation: piece.rotation_degrees ?? 0,
          mirror: piece.mirror ?? null,
          parentAreaId: piece.parent_area_id ?? null,
        })),
    }))
}

export function loadTerrainTemplates(core: string): TerrainTemplate[] {
  return readOptionalList<RawTerrainTemplate>(path.join(core, 'terrain-templates.json')).map((template) => ({
    id: template.id,
    name: template.name,
    kind: template.kind,
    points: footprintPoints(template.footprint),
    features: (template.features ?? []).map((feature) => ({
      id: feature.id,
      templateId: feature.template,
      position: feature.position ?? { x: 0, y: 0 },
      rotation: feature.rotation_degrees ?? 0,
      mirror: feature.mirror ?? null,
    })),
  }))
}

function battlemasterGeometry(
  directory: string,
  ids: ReadonlyMap<string, string | null>,
  description: string | undefined,
  pieces: NonNullable<RawTerrainLayout['pieces']>,
  templates: ReadonlyMap<string, RawTerrainTemplate>,
): TerrainGeometry | null {
  const directId = description?.match(/Battlemaster layout (terrain-[0-9a-f-]+)/)?.[1]
  const reference = description?.match(/Battlemaster REST API layout ([\w-]+)\/([\w-]+)\.?$/)
  const id = directId ?? (reference ? ids.get(battlemasterReference(reference[1]!, reference[2]!)) : null)
  if (!id) return null
  const file = path.join(directory, 'layouts', `${id}.json`)
  if (!fs.existsSync(file)) return null
  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as RawBattlemasterLayout
  if (!battlemasterLayoutMatches(raw.layout, id) || !raw.terrain?.length) return null

  const areas = raw.terrain.map((area, areaIndex) => {
    const sourceId = area.id ?? `area-${String(areaIndex + 1).padStart(2, '0')}`
    return { area, piece: pieces.find((candidate) => candidate.id === sourceId) ?? pieces[areaIndex] }
  })
  const resolveMarkerCollision = hasCollidingTerrainReferenceMarkers(areas)

  return {
    areas: areas.map(({ area, piece }, areaIndex) => {
      const areaId = area.id ?? `area-${areaIndex + 1}`
      const objectivePosition = piece?.is_objective ? (piece.objective?.position ?? piece.position) : undefined
      const objective = objectivePosition ? { position: objectivePosition, group: piece?.link_group ?? null } : null
      return {
        id: areaId,
        name: area.name,
        points: area.outline.points.map((point) => battlemasterBoardPoint(point, area.footprint)),
        markers: terrainReferenceMarkers(area, resolveMarkerCollision ? piece?.objective_role : undefined),
        objective,
        // Already-open clients use this field to combine linked objectives.
        objectiveGroup: objective?.group ?? null,
        measurements: terrainMeasurements(area, piece, piece ? templates.get(piece.template) : undefined),
        parts: area.parts.map((part, partIndex) => ({
          id: part.id ?? `area-${areaIndex + 1}-part-${partIndex + 1}`,
          name: part.name,
          material: part.material,
          roof: part.outline?.points.map((point) => battlemasterBoardPoint(point, area.footprint, part)) ?? null,
          walls: part.walls.map((wall, wallIndex) => ({
            id: wall.id ?? `area-${areaIndex + 1}-part-${partIndex + 1}-wall-${wallIndex + 1}`,
            points: wall.points.map((point) => battlemasterBoardPoint(point, area.footprint, part)),
            thickness: wall.thicknessIn,
          })),
        })),
      }
    }),
  }
}

function terrainMeasurements(
  area: RawBattlemasterTerrain,
  piece: NonNullable<RawTerrainLayout['pieces']>[number] | undefined,
  template: RawTerrainTemplate | undefined,
): { from: Point; to: Point }[] {
  const points = template?.footprint.points
  // References index the rules template, not an independently revised Battlemaster outline.
  if (
    !points?.length ||
    points.length !== area.outline.points.length ||
    points.some((point, index) => {
      const other = area.outline.points[index]!
      return Math.abs(point.x - other.x) > 0.002 || Math.abs(point.y - (area.footprint.heightIn - other.y)) > 0.002
    })
  )
    return []

  const referencedByEdge = new Map<string, Set<number>>()
  for (const { edge, ref } of piece?.keystones ?? []) {
    if (ref.kind !== 'vertex' || !Number.isInteger(ref.index)) continue
    const referenced = referencedByEdge.get(edge) ?? new Set<number>()
    referenced.add(ref.index!)
    referencedByEdge.set(edge, referenced)
  }

  return (piece?.keystones ?? []).flatMap(({ edge, ref }) => {
    if (ref.kind !== 'vertex' || !Number.isInteger(ref.index)) return []
    const point = area.outline.points[ref.index!]
    if (!point) return []
    const nextIndex = (ref.index! + 1) % area.outline.points.length
    const next = area.outline.points[nextIndex]
    const candidates = [point]
    if (next && Math.hypot(next.x - point.x, next.y - point.y) >= 1 && !referencedByEdge.get(edge)?.has(nextIndex)) candidates.push(next)
    const to = candidates
      .map((candidate) => battlemasterBoardPoint(candidate, area.footprint))
      .reduce((nearest, candidate) => (distanceFromBoardEdge(candidate, edge) < distanceFromBoardEdge(nearest, edge) ? candidate : nearest))
    if (edge === 'left') return [{ from: { x: 0, y: to.y }, to }]
    if (edge === 'right') return [{ from: { x: 60, y: to.y }, to }]
    if (edge === 'top') return [{ from: { x: to.x, y: 0 }, to }]
    if (edge === 'bottom') return [{ from: { x: to.x, y: 44 }, to }]
    return []
  })
}

function distanceFromBoardEdge(point: Point, edge: string) {
  if (edge === 'left') return point.x
  if (edge === 'right') return 60 - point.x
  if (edge === 'top') return point.y
  if (edge === 'bottom') return 44 - point.y
  return Number.POSITIVE_INFINITY
}

function battlemasterLayoutIds(directory: string) {
  const file = path.join(directory, 'catalog.json')
  const found = new Map<string, string | null>()
  if (!fs.existsSync(file)) return found
  const catalog = JSON.parse(fs.readFileSync(file, 'utf8')) as RawBattlemasterCatalog
  for (const layout of catalog.layouts ?? []) {
    if (!layout.id?.match(/^terrain-[0-9a-f-]+$/) || !layout.name) continue
    for (const owner of [layout.owner, layout.ownerUsername]) {
      if (!owner) continue
      const key = battlemasterReference(owner, layout.name)
      const existing = found.get(key)
      if (!found.has(key)) found.set(key, layout.id)
      else if (existing !== layout.id) found.set(key, null)
    }
  }
  return found
}

function battlemasterReference(owner: string, name: string) {
  return `${routeSlug(owner)}/${routeSlug(name)}`
}

function battlemasterLayoutMatches(layout: RawBattlemasterLayout['layout'], id: string) {
  if (layout?.id === id) return true
  if (!layout?.links?.page) return false
  try {
    return new URL(layout.links.page).pathname.endsWith(`/${id}`)
  } catch {
    return false
  }
}

function hasCollidingTerrainReferenceMarkers(
  areas: { area: RawBattlemasterTerrain; piece: NonNullable<RawTerrainLayout['pieces']>[number] | undefined }[],
) {
  const labels = areas.flatMap(({ area }) => terrainReferenceLabels(area))
  const count = (label: string) => labels.filter((candidate) => candidate === label).length
  const home = areas.filter(({ piece }) => piece?.objective_role === 'home')
  const expansion = areas.filter(({ piece }) => piece?.objective_role === 'expansion')

  // The official cards use one mirrored pair of every label. Battlemaster can
  // reuse one component name across the home and expansion pairs; their roles
  // preserve which pair the card calls EF and which it calls CD/GH.
  return (
    count('AB') === 2 &&
    ['CD', 'EF', 'GH']
      .map(count)
      .toSorted((left, right) => left - right)
      .join() === '0,2,4' &&
    home.length === 2 &&
    home.every(({ area }) => terrainReferenceLabels(area).length === 1 && !terrainReferenceLabels(area).includes('AB')) &&
    expansion.length === 2 &&
    expansion.every(({ area }) => terrainReferenceLabels(area).length === 2 && terrainReferenceLabels(area).includes('GH'))
  )
}

function terrainReferenceMarkers(area: RawBattlemasterTerrain, objectiveRole?: string) {
  const labels = terrainReferenceLabels(area)
  const areaPoints = area.outline.points.map((point) => battlemasterBoardPoint(point, area.footprint))
  const areaCentre = averagePoint(areaPoints)
  return labels.map((label, index) => {
    const part = area.parts.find((candidate) => candidate.name === label)
    const partPoints = part
      ? [...(part.outline?.points ?? []), ...part.walls.flatMap((wall) => wall.points)].map((point) =>
          battlemasterBoardPoint(point, area.footprint, part),
        )
      : []
    const fraction = labels.length === 1 ? 0.5 : (index + 1) / (labels.length + 1)
    const partCentre = partPoints.length ? averagePoint(partPoints) : null
    const towardCentre = partCentre ? { x: areaCentre.x - partCentre.x, y: areaCentre.y - partCentre.y } : null
    const towardCentreLength = towardCentre ? Math.hypot(towardCentre.x, towardCentre.y) : 0
    return {
      label: objectiveRole === 'home' ? 'EF' : objectiveRole === 'expansion' && label !== 'GH' ? 'CD' : label,
      position:
        partCentre && towardCentre && towardCentreLength
          ? boardPoint(partCentre.x + (towardCentre.x / towardCentreLength) * 2, partCentre.y + (towardCentre.y / towardCentreLength) * 2)
          : battlemasterBoardPoint({ x: area.footprint.widthIn * fraction, y: area.footprint.heightIn / 2 }, area.footprint),
    }
  })
}

function terrainReferenceLabels(area: RawBattlemasterTerrain): string[] {
  return area.name.match(/\b(?:AB|CD|EF|GH)\b/g) ?? []
}

function averagePoint(points: Point[]) {
  return {
    x: points.reduce((total, point) => total + point.x, 0) / points.length,
    y: points.reduce((total, point) => total + point.y, 0) / points.length,
  }
}

function battlemasterBoardPoint(
  point: Point,
  area: RawBattlemasterTerrain['footprint'],
  part?: RawBattlemasterTerrain['parts'][number],
): Point {
  let placed = point
  if (part) {
    placed = {
      x: part.mirroredX ? -placed.x : placed.x,
      y: part.mirroredY ? -placed.y : placed.y,
    }
    placed = rotatePoint(placed, part.rotationDeg)
    placed = { x: placed.x + part.origin.x, y: placed.y + part.origin.y }
  }
  placed = rotatePoint(placed, area.rotationDeg)
  placed = { x: placed.x + area.origin.x, y: placed.y + area.origin.y }
  return boardPoint(placed.x + 30, 22 - placed.y)
}

/**
 * Rotation trigonometry leaves full IEEE-754 noise on every coordinate, and a
 * serialized `22.500999999999998` is five times the bytes of `22.501`. A
 * thousandth of an inch is far below anything the board renders.
 */
function boardPoint(x: number, y: number): Point {
  return { x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 }
}

function rotatePoint(point: Point, degrees: number): Point {
  const radians = (degrees * Math.PI) / 180
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)
  return { x: point.x * cosine - point.y * sine, y: point.x * sine + point.y * cosine }
}

function footprintPoints(footprint: RawTerrainTemplate['footprint']): Point[] {
  if (footprint.points?.length) return footprint.points
  if (footprint.width && footprint.height) {
    return [
      { x: 0, y: 0 },
      { x: footprint.width, y: 0 },
      { x: footprint.width, y: footprint.height },
      { x: 0, y: footprint.height },
    ]
  }
  return []
}

function pointsOf(shape: { points?: Point[]; width?: number; height?: number } | undefined): Point[] {
  if (shape?.points?.length) return shape.points
  if (shape?.width && shape.height) {
    return [
      { x: 0, y: 0 },
      { x: shape.width, y: 0 },
      { x: shape.width, y: shape.height },
      { x: 0, y: shape.height },
    ]
  }
  return []
}

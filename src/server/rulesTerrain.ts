import fs from 'node:fs'
import path from 'node:path'
import { readOptionalList } from './rulesSource'

/**
 * The battlefield, as polygons the interface can draw rather than words it must
 * describe.
 *
 * Three sources meet here: the deployment patterns and terrain layouts the mission
 * dataset ships, and the exact geometry Battlemaster publishes for a named layout.
 * A layout without its pinned geometry is reported as absent rather than guessed at,
 * because a battlefield drawn from the wrong measurements is worse than none.
 */

export type Point = { x: number; y: number }

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
    link_group?: string
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

export type TerrainGeometry = {
  areas: {
    id: string
    name: string
    points: Point[]
    markers: { label: string; position: Point }[]
    objectiveGroup: string | null
    parts: {
      id: string
      name: string
      material: string
      roof: Point[] | null
      walls: { id: string; points: Point[]; thickness: number }[]
    }[]
  }[]
}

/** A battlefield, as polygons the interface can draw rather than words it must describe. */
export type Deployment = {
  id: string
  name: string
  description: string | null
  /** Points are absolute: each zone's own offset is already applied. */
  zones: { player: string; name: string; colour: string; points: Point[] }[]
  objectives: Point[]
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
          points: pointsOf(zone.shape).map((point) => ({
            x: point.x + (zone.position?.x ?? 0),
            y: point.y + (zone.position?.y ?? 0),
          })),
        })),
      objectives: pattern.objectives ?? [],
    }))
    .filter((pattern) => pattern.zones.length)
    .toSorted((left, right) => left.name.localeCompare(right.name))
}

export type TerrainLayout = {
  id: string
  name: string
  description: string | null
  matchupId: string
  variant: number | null
  deploymentId: string | null
  pieces: {
    id: string
    name: string
    type: string
    templateId: string
    position: Point
    rotation: number
    mirror: string | null
    parentAreaId: string | null
  }[]
  geometry: TerrainGeometry | null
}

/** Layouts without a matchup are skipped: nothing in the app can reach one. */
export function loadTerrainLayouts(core: string, battlemasterDirectory: string): TerrainLayout[] {
  return readOptionalList<RawTerrainLayout>(path.join(core, 'terrain-layouts.json'))
    .filter((layout) => layout.mission_matchup_id)
    .map((layout) => ({
      id: layout.id,
      name: layout.name,
      description: layout.description ?? null,
      matchupId: layout.mission_matchup_id!,
      variant: layout.variant ?? null,
      deploymentId: layout.deployment_pattern_id ?? null,
      geometry: battlemasterGeometry(battlemasterDirectory, layout.description, layout.pieces ?? []),
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

export type TerrainTemplate = {
  id: string
  name: string
  kind: string
  points: Point[]
  features: { id: string; templateId: string; position: Point; rotation: number; mirror: string | null }[]
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
  description: string | undefined,
  pieces: NonNullable<RawTerrainLayout['pieces']>,
): TerrainGeometry | null {
  const id = description?.match(/Battlemaster layout (terrain-[0-9a-f-]+)/)?.[1]
  if (!id) return null
  const file = path.join(directory, 'layouts', `${id}.json`)
  if (!fs.existsSync(file)) return null
  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as RawBattlemasterLayout
  if (!battlemasterLayoutMatches(raw.layout, id) || !raw.terrain?.length) return null

  return {
    areas: raw.terrain.map((area, areaIndex) => {
      const areaId = area.id ?? `area-${areaIndex + 1}`
      const sourceId = area.id ?? `area-${String(areaIndex + 1).padStart(2, '0')}`
      const piece = pieces.find((candidate) => candidate.id === sourceId) ?? pieces[areaIndex]
      return {
        id: areaId,
        name: area.name,
        points: area.outline.points.map((point) => battlemasterBoardPoint(point, area.footprint)),
        markers: terrainReferenceMarkers(area),
        objectiveGroup: piece?.is_objective ? (piece.link_group ?? null) : null,
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

function battlemasterLayoutMatches(layout: RawBattlemasterLayout['layout'], id: string) {
  if (layout?.id === id) return true
  if (!layout?.links?.page) return false
  try {
    return new URL(layout.links.page).pathname.endsWith(`/${id}`)
  } catch {
    return false
  }
}

function terrainReferenceMarkers(area: RawBattlemasterTerrain) {
  const labels = area.name.match(/\b(?:AB|CD|EF|GH)\b/g) ?? []
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
      label,
      position:
        partCentre && towardCentre && towardCentreLength
          ? {
              x: partCentre.x + (towardCentre.x / towardCentreLength) * 2,
              y: partCentre.y + (towardCentre.y / towardCentreLength) * 2,
            }
          : battlemasterBoardPoint({ x: area.footprint.widthIn * fraction, y: area.footprint.heightIn / 2 }, area.footprint),
    }
  })
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
  return { x: placed.x + 30, y: 22 - placed.y }
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

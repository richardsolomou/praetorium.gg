import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import type { Point, TerrainGeometry } from '../contracts/terrain'

export type { Deployment, Point, TerrainGeometry, TerrainLayout, TerrainTemplate } from '../contracts/terrain'

type Footprint = { origin: Point; widthIn: number; heightIn: number; rotationDeg: number }
type Part = {
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
}
type Area = {
  id?: string
  name: string
  footprint: Footprint
  outline: { points: Point[] }
  parts: Part[]
}
type Layout = {
  layout?: { id?: string; layoutKey?: string; links?: { page?: string } }
  terrain?: Area[]
}

type LabelCorrection = {
  layoutId: string
  layoutKey: string
  areaName: string
  from: 'AB' | 'CD' | 'EF' | 'GH'
  to: 'AB' | 'CD' | 'EF' | 'GH'
}

function labelCorrection(directory: string, id: string, raw: Layout): LabelCorrection | null {
  const file = path.join(directory, 'terrain-labels.json')
  if (!fs.existsSync(file)) return null
  const document = JSON.parse(fs.readFileSync(file, 'utf8')) as {
    format?: string
    battlemasterRevision?: string
    corrections?: LabelCorrection[]
  }
  const catalog = JSON.parse(fs.readFileSync(path.join(directory, 'catalog.json'), 'utf8')) as { catalogKey?: string }
  if (
    document.format !== 'praetorium.terrain-label-corrections.v1' ||
    !catalog.catalogKey ||
    document.battlemasterRevision !== createHash('sha256').update(catalog.catalogKey).digest('hex') ||
    !Array.isArray(document.corrections)
  )
    throw new Error('terrain label corrections do not match the Battlemaster source')
  const candidates = document.corrections.filter((entry) => entry.layoutId === id)
  if (!candidates.length) return null
  if (candidates.length !== 1 || candidates[0]?.layoutKey !== raw.layout?.layoutKey)
    throw new Error(`terrain label correction is stale for ${id}`)
  const correction = candidates[0]!
  if (
    !['AB', 'CD', 'EF', 'GH'].includes(correction.from) ||
    !['AB', 'CD', 'EF', 'GH'].includes(correction.to) ||
    raw.terrain?.filter((area) => area.name === correction.areaName).length !== 2 ||
    correction.areaName.match(new RegExp(`\\b${correction.from}\\b`, 'g'))?.length !== 1
  )
    throw new Error(`terrain label correction does not match ${id}`)
  return correction
}

export function battlemasterGeometry(directory: string, id: string): TerrainGeometry | null {
  if (!/^terrain-[0-9a-f-]+$/.test(id)) return null
  const file = path.join(directory, 'layouts', `${id}.json`)
  if (!fs.existsSync(file)) return null
  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Layout
  if (!raw.terrain?.length || !matches(raw.layout, id)) return null
  const correction = labelCorrection(directory, id, raw)
  return {
    board: { width: 60, height: 44 },
    areas: raw.terrain.map((area, at) => {
      const points = area.outline.points.map((point) => boardPoint(point, area.footprint))
      const name = area.name === correction?.areaName ? area.name.replace(new RegExp(`\\b${correction.from}\\b`), correction.to) : area.name
      const letters = name.match(/\b(?:AB|CD|EF|GH)\b/g) ?? []
      return {
        id: area.id ?? `area-${at + 1}`,
        name,
        points,
        markers: letters.map((label, index) => ({
          label,
          position: boardPoint(
            { x: (area.footprint.widthIn * (index + 1)) / (letters.length + 1), y: area.footprint.heightIn / 2 },
            area.footprint,
          ),
        })),
        objective: null,
        objectiveGroup: null,
        measurements: placementMeasurements(area),
        parts: area.parts.map((part, partIndex) => ({
          id: part.id ?? `area-${at + 1}-part-${partIndex + 1}`,
          name: part.name,
          material: part.material,
          roof: part.outline?.points.map((point) => boardPoint(point, area.footprint, part)) ?? null,
          walls: part.walls.map((wall, wallIndex) => ({
            id: wall.id ?? `area-${at + 1}-part-${partIndex + 1}-wall-${wallIndex + 1}`,
            points: wall.points.map((point) => boardPoint(point, area.footprint, part)),
            thickness: wall.thicknessIn,
          })),
        })),
      }
    }),
  }
}

function placementMeasurements(area: Area): TerrainGeometry['areas'][number]['measurements'] {
  if (!area.outline.points.length) return []
  const footprint = area.footprint
  const corners = [
    { x: 0, y: 0 },
    { x: footprint.widthIn, y: 0 },
    { x: footprint.widthIn, y: footprint.heightIn },
    { x: 0, y: footprint.heightIn },
  ]
    .flatMap((corner, index) => {
      const point = area.outline.points.reduce((nearest, candidate) =>
        Math.hypot(candidate.x - corner.x, candidate.y - corner.y) < Math.hypot(nearest.x - corner.x, nearest.y - corner.y)
          ? candidate
          : nearest,
      )
      return Math.hypot(point.x - corner.x, point.y - corner.y) <= 0.01 ? [{ index, point: boardPoint(point, footprint) }] : []
    })
    .filter(({ point }) => point.x >= 0 && point.x <= 60 && point.y >= 0 && point.y <= 44)
  if (!corners.length) return []

  const centre = {
    x: corners.reduce((total, { point }) => total + point.x, 0) / corners.length,
    y: corners.reduce((total, { point }) => total + point.y, 0) / corners.length,
  }
  const edgeX = centre.x < 30 ? 0 : 60
  const edgeY = centre.y < 22 ? 0 : 44
  const anchor = corners.reduce((nearest, corner) =>
    Math.abs(corner.point.x - edgeX) + Math.abs(corner.point.y - edgeY) <
    Math.abs(nearest.point.x - edgeX) + Math.abs(nearest.point.y - edgeY)
      ? corner
      : nearest,
  )
  const corner = anchor.point
  const measurements = [
    { from: { x: edgeX, y: corner.y }, to: corner },
    { from: { x: corner.x, y: edgeY }, to: corner },
  ]
  const adjacent = corners.filter((candidate) => Math.abs(candidate.index - anchor.index) % 2 === 1)
  const second = adjacent.toSorted(
    (left, right) =>
      Math.hypot(right.point.x - corner.x, right.point.y - corner.y) - Math.hypot(left.point.x - corner.x, left.point.y - corner.y),
  )[0]?.point
  if (second) {
    const dx = Math.abs(second.x - corner.x)
    const dy = Math.abs(second.y - corner.y)
    if (Math.min(dx, dy) > 0.01) {
      measurements.push({ from: dx > dy ? { x: second.x, y: edgeY } : { x: edgeX, y: second.y }, to: second })
    }
  }
  return measurements.filter(({ from, to }) => from.x !== to.x || from.y !== to.y)
}

function matches(layout: Layout['layout'], id: string) {
  if (layout?.id === id) return true
  if (!layout?.links?.page) return false
  try {
    return new URL(layout.links.page).pathname.endsWith(`/${id}`)
  } catch {
    return false
  }
}

function boardPoint(point: Point, area: Footprint, part?: Part): Point {
  let placed = point
  if (part) {
    placed = { x: part.mirroredX ? -placed.x : placed.x, y: part.mirroredY ? -placed.y : placed.y }
    placed = rotate(placed, part.rotationDeg)
    placed = { x: placed.x + part.origin.x, y: placed.y + part.origin.y }
  }
  placed = rotate(placed, area.rotationDeg)
  placed = { x: placed.x + area.origin.x, y: placed.y + area.origin.y }
  return { x: Math.round((placed.x + 30) * 1000) / 1000, y: Math.round((22 - placed.y) * 1000) / 1000 }
}

function rotate(point: Point, degrees: number): Point {
  const radians = (degrees * Math.PI) / 180
  return { x: point.x * Math.cos(radians) - point.y * Math.sin(radians), y: point.x * Math.sin(radians) + point.y * Math.cos(radians) }
}

import fs from 'node:fs'
import path from 'node:path'
import { createHash, hash } from 'node:crypto'
import type { Point, TerrainGeometry } from '../contracts/terrain'
import { battlemasterObjectiveHosts } from './battlemasterObjectives'

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
  boundsWidthIn: number
  boundsHeightIn: number
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
  layout?: {
    id?: string
    layoutKey?: string
    links?: { page?: string }
    board?: { widthIn?: number; heightIn?: number }
    chapterApprovedSlot?: { archetypeA: string; archetypeB: string; slotIndex: number }
    chapterApprovedDeploymentKey?: number
  }
  terrain?: Area[]
}

type LabelCorrection = {
  layoutId: string
  layoutKey: string
  areaName: string
  from: 'AB' | 'CD' | 'EF' | 'GH'
  to: 'AB' | 'CD' | 'EF' | 'GH'
}

/** Whether a correction file was written against the Battlemaster catalogue installed beside it. */
function matchesBattlemaster(directory: string, revision: string | undefined) {
  const { catalogKey } = JSON.parse(fs.readFileSync(path.join(directory, 'catalog.json'), 'utf8')) as { catalogKey?: string }
  return !!catalogKey && revision === hash('sha256', catalogKey)
}

function labelCorrection(directory: string, id: string, raw: Layout): LabelCorrection | null {
  const file = path.join(directory, 'terrain-labels.json')
  if (!fs.existsSync(file)) return null
  const document = JSON.parse(fs.readFileSync(file, 'utf8')) as {
    format?: string
    battlemasterRevision?: string
    corrections?: LabelCorrection[]
  }
  if (
    document.format !== 'praetorium.terrain-label-corrections.v1' ||
    !matchesBattlemaster(directory, document.battlemasterRevision) ||
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

/**
 * This layout's entries in a Praetorium file written against the Battlemaster catalogue beside it, each naming
 * one of its footprints by index and name; none where the file or the layout's entries are absent.
 */
function footprintEntries<T extends { layoutId: string; layoutKey: string; area: string; name: string }>(
  directory: string,
  fileName: string,
  format: string,
  id: string,
  raw: Layout,
): (T & { index: number })[] {
  const file = path.join(directory, fileName)
  if (!fs.existsSync(file)) return []
  const document = JSON.parse(fs.readFileSync(file, 'utf8')) as { format?: string; battlemasterRevision?: string; entries?: T[] }
  if (document.format !== format || !matchesBattlemaster(directory, document.battlemasterRevision) || !Array.isArray(document.entries))
    throw new Error(`${fileName} does not match the Battlemaster source`)
  return document.entries
    .filter((entry) => entry.layoutId === id)
    .map((entry) => {
      const index = /^area-[1-9]\d*$/.test(entry.area) ? Number(entry.area.slice(5)) - 1 : -1
      if (entry.layoutKey !== raw.layout?.layoutKey) throw new Error(`${fileName} is stale for ${id}`)
      if (raw.terrain?.[index]?.name !== entry.name) throw new Error(`${fileName} does not match ${id}`)
      return { ...entry, index }
    })
}

/**
 * `raw` with footprints moved to where the printed map measures them, for layouts whose
 * Battlemaster placement disagrees with the publisher's.
 */
function correctPositions(directory: string, id: string, raw: Layout): Layout {
  const corrections = footprintEntries<{ layoutId: string; layoutKey: string; area: string; name: string; origin: Point }>(
    directory,
    'terrain-positions.json',
    'praetorium.terrain-position-corrections.v1',
    id,
    raw,
  )
  if (!corrections.length) return raw
  const terrain = [...raw.terrain!]
  for (const { index, origin } of corrections) {
    if (!Number.isFinite(origin?.x) || !Number.isFinite(origin?.y)) throw new Error(`terrain position correction does not match ${id}`)
    terrain[index] = { ...terrain[index]!, footprint: { ...terrain[index]!.footprint, origin } }
  }
  return { ...raw, terrain }
}

/** Objectives on the footprints a layout without a Chapter Approved objective layout names, each at its footprint's centre. */
function namedObjectives(directory: string, id: string, raw: Layout, board: TerrainGeometry['board']) {
  const objectives: (TerrainGeometry['areas'][number]['objective'] | undefined)[] = []
  for (const { index } of footprintEntries(directory, 'terrain-objectives.json', 'praetorium.terrain-objectives.v1', id, raw)) {
    const footprint = raw.terrain![index]!.footprint
    const centre = { x: footprint.widthIn / 2, y: footprint.heightIn / 2 }
    objectives[index] = { position: boardPoint(centre, board, footprint), group: null }
  }
  return objectives
}

/** Each footprint's terrain area group, keyed by footprint index; footprints that are a terrain area on their own are absent. */
function terrainAreaGroups(directory: string, id: string, raw: Layout): Map<number, string> {
  const groups = new Map<number, string>()
  const file = path.join(directory, 'terrain-areas.json')
  if (!fs.existsSync(file)) return groups
  const document = JSON.parse(fs.readFileSync(file, 'utf8')) as {
    format?: string
    battlemasterRevision?: string
    layouts?: { layoutId: string; layoutKey: string; groups: { id: string; name: string }[][] }[]
  }
  if (
    document.format !== 'praetorium.terrain-area-groups.v1' ||
    !matchesBattlemaster(directory, document.battlemasterRevision) ||
    !Array.isArray(document.layouts)
  )
    throw new Error('terrain area groups do not match the Battlemaster source')
  const entries = document.layouts.filter((entry) => entry.layoutId === id)
  if (!entries.length) return groups
  if (entries.length !== 1 || entries[0]!.layoutKey !== raw.layout?.layoutKey) throw new Error(`terrain area groups are stale for ${id}`)
  for (const members of entries[0]!.groups) {
    const indexes = members.map((member) => (/^area-[1-9]\d*$/.test(member.id) ? Number(member.id.slice(5)) - 1 : -1))
    if (
      members.length < 2 ||
      indexes.some((index, at) => raw.terrain?.[index]?.name !== members[at]!.name || groups.has(index) || indexes.indexOf(index) !== at)
    )
      throw new Error(`terrain area groups do not match ${id}`)
    for (const index of indexes) groups.set(index, members[0]!.id)
  }
  return groups
}

const geometries = new Map<string, { source: string; geometry: TerrainGeometry | null }>()

/**
 * A layout's geometry, shared by every rules load that reads it while its source files are unchanged.
 *
 * Every rules version reads the same Battlemaster directory, and geometry is most of a version's terrain data.
 * Callers must not modify the result.
 */
export function battlemasterGeometry(directory: string, id: string): TerrainGeometry | null {
  if (!/^terrain-[0-9a-f-]+$/.test(id)) return null
  const file = path.join(directory, 'layouts', `${id}.json`)
  if (!fs.existsSync(file)) return null
  const liteFile = path.join(directory, 'layouts', `${id}.lite.json`)
  const source = createHash('sha256')
  for (const input of [
    file,
    liteFile,
    path.join(directory, 'terrain-labels.json'),
    path.join(directory, 'terrain-areas.json'),
    path.join(directory, 'terrain-positions.json'),
    path.join(directory, 'terrain-objectives.json'),
    path.join(directory, 'catalog.json'),
  ])
    source.update(fs.existsSync(input) ? fs.readFileSync(input) : '').update('\0')
  const fingerprint = source.digest('hex')
  const cached = geometries.get(file)
  if (cached?.source === fingerprint) return cached.geometry
  const geometry = readGeometry(directory, id, file, liteFile)
  geometries.set(file, { source: fingerprint, geometry })
  return geometry
}

function readGeometry(directory: string, id: string, file: string, liteFile: string): TerrainGeometry | null {
  const served = JSON.parse(fs.readFileSync(file, 'utf8')) as Layout
  if (!served.terrain?.length || !matches(served.layout, id)) return null
  const raw = correctPositions(directory, id, served)
  const board = { width: served.layout?.board?.widthIn ?? 60, height: served.layout?.board?.heightIn ?? 44 }
  const at = (point: Point, area: Footprint, part?: Part) => boardPoint(point, board, area, part)
  const correction = labelCorrection(directory, id, raw)
  const groups = terrainAreaGroups(directory, id, raw)
  const objectives = fs.existsSync(liteFile)
    ? battlemasterObjectiveHosts(served, JSON.parse(fs.readFileSync(liteFile, 'utf8')), id)
    : namedObjectives(directory, id, raw, board)
  return {
    board,
    areas: raw.terrain!.map((area, index) => {
      const points = area.outline.points.map((point) => at(point, area.footprint))
      const name = area.name === correction?.areaName ? area.name.replace(new RegExp(`\\b${correction.from}\\b`), correction.to) : area.name
      const letters = name.match(/\b(?:AB|CD|EF|GH)\b/g) ?? []
      return {
        id: area.id ?? `area-${index + 1}`,
        name,
        points,
        markers: letters.flatMap((label) => {
          const partLabel = area.name === correction?.areaName && label === correction.to ? correction.from : label
          const parts = area.parts.filter((part) => part.name === partLabel || (partLabel === 'CD' && part.name === 'CO'))
          const part = parts.length === 1 ? parts[0] : undefined
          const partPoints = part?.outline?.points ?? part?.walls.flatMap((wall) => wall.points) ?? []
          if (!part || !partPoints.length) return []
          const centre = {
            x: (Math.min(...partPoints.map((point) => point.x)) + Math.max(...partPoints.map((point) => point.x))) / 2,
            y: (Math.min(...partPoints.map((point) => point.y)) + Math.max(...partPoints.map((point) => point.y))) / 2,
          }
          return [{ label, position: at(centre, area.footprint, part) }]
        }),
        objective: objectives[index] ?? null,
        group: groups.get(index) ?? null,
        measurements: placementMeasurements(area, board),
        parts: area.parts.map((part, partIndex) => ({
          id: part.id ?? `area-${index + 1}-part-${partIndex + 1}`,
          name: part.name,
          material: part.material,
          roof: part.outline?.points.map((point) => at(point, area.footprint, part)) ?? null,
          walls: part.walls.map((wall, wallIndex) => ({
            id: wall.id ?? `area-${index + 1}-part-${partIndex + 1}-wall-${wallIndex + 1}`,
            points: wall.points.map((point) => at(point, area.footprint, part)),
            thickness: wall.thicknessIn,
          })),
        })),
      }
    }),
  }
}

function placementMeasurements(area: Area, board: TerrainGeometry['board']): TerrainGeometry['areas'][number]['measurements'] {
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
      return Math.hypot(point.x - corner.x, point.y - corner.y) <= 0.01 ? [{ index, point: boardPoint(point, board, footprint) }] : []
    })
    .filter(({ point }) => point.x >= 0 && point.x <= board.width && point.y >= 0 && point.y <= board.height)
  if (!corners.length) return []

  const centre = {
    x: corners.reduce((total, { point }) => total + point.x, 0) / corners.length,
    y: corners.reduce((total, { point }) => total + point.y, 0) / corners.length,
  }
  const edgeX = centre.x < board.width / 2 ? 0 : board.width
  const edgeY = centre.y < board.height / 2 ? 0 : board.height
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
  return Boolean(layout?.links?.page && URL.parse(layout.links.page)?.pathname.endsWith(`/${id}`))
}

function boardPoint(point: Point, board: TerrainGeometry['board'], area: Footprint, part?: Part): Point {
  let placed = point
  if (part) {
    placed = {
      x: part.mirroredX ? part.boundsWidthIn - placed.x : placed.x,
      y: part.mirroredY ? part.boundsHeightIn - placed.y : placed.y,
    }
    placed = rotate(placed, part.rotationDeg)
    placed = { x: placed.x + part.origin.x, y: placed.y + part.origin.y }
  }
  placed = rotate(placed, area.rotationDeg)
  placed = { x: placed.x + area.origin.x, y: placed.y + area.origin.y }
  return { x: Math.round((placed.x + board.width / 2) * 1000) / 1000, y: Math.round((board.height / 2 - placed.y) * 1000) / 1000 }
}

function rotate(point: Point, degrees: number): Point {
  const radians = (degrees * Math.PI) / 180
  return { x: point.x * Math.cos(radians) - point.y * Math.sin(radians), y: point.x * Math.sin(radians) + point.y * Math.cos(radians) }
}

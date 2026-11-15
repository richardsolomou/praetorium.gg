import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { KOTC_MATCHUP_ID, type Deployment, type Point, type TerrainGeometry, type TerrainLayout } from '../contracts/terrain'

const BOARD_IN = 36
const point = z.object({ x: z.number().min(0).max(BOARD_IN), y: z.number().min(0).max(BOARD_IN) })
const wall = z.array(point).min(2).max(12)
const bearing = z.number().min(-360).max(360)
const baseSchema = z.object({
  format: z.literal('praetorium.kotc.v1'),
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().trim().min(1),
  publisher: z.literal('https://playontabletop.com/kotc/'),
  boardIn: z.literal(BOARD_IN),
  deploymentDepthIn: z.number().int().min(6).max(12),
  objectiveDiagram: z.string().refine(publisherImage),
  terrainDiagram: z.string().refine(publisherImage),
  wallThicknessIn: z.number().positive().max(2),
  pieces: z
    .array(
      z.object({
        name: z.string().trim().min(1),
        mirrors: z
          .array(z.enum(['none', 'x', 'y', 'xy']))
          .min(1)
          .max(4)
          .refine((values) => new Set(values).size === values.length),
        parts: z
          .array(
            z.object({
              name: z.string().trim().min(1),
              material: z.enum(['dense', 'light']),
              floor: z.array(point).min(3).max(12).optional(),
              walls: z.array(wall).min(1).max(8),
            }),
          )
          .min(1)
          .max(4),
      }),
    )
    .min(1)
    .max(8),
})
const sourceSchema = z.union([
  // The four outer objectives stand on walls centred on them.
  baseSchema.extend({
    arena: z.object({ radiusIn: z.number().positive().max(16), wallHalfAngleDeg: z.number().positive().max(45) }),
    objectiveRadiusIn: z.number().positive().max(6),
  }),
  // Impassable walls run between four gaps, each holding an outer objective `objectiveInsetIn` from its board edge.
  baseSchema.extend({
    arena: z.object({
      radiusIn: z.number().positive().max(16),
      wallArcsDeg: z.array(z.tuple([bearing, bearing])).length(4),
      objectiveInsetIn: z
        .number()
        .positive()
        .max(BOARD_IN / 2),
    }),
  }),
])
type Source = z.infer<typeof sourceSchema>
type WalledSource = Extract<Source, { objectiveRadiusIn: number }>
type Area = TerrainGeometry['areas'][number]

/** The current Colosseum first, then the one it replaced. */
const FILES = ['kotc.json', 'kotc-1.json']

/**
 * The Colosseums as Play On Tabletop prints them, north at the top, turned into the
 * landscape board frame every other layout uses.
 *
 * The publisher prints only the board size, deployment depth and, for the first Colosseum, the objective
 * positions; the arena radius, objective range and piece outlines are traced from diagrams, so the layout says so.
 */
export function kotcTerrain(directory: string): { deployment: Deployment; layout: TerrainLayout }[] {
  return FILES.flatMap((name) => {
    const file = path.join(directory, name)
    if (!fs.existsSync(file)) return []
    const parsed = sourceSchema.safeParse(JSON.parse(fs.readFileSync(file, 'utf8')))
    if (!parsed.success) return []
    if ('objectiveRadiusIn' in parsed.data && parsed.data.objectiveRadiusIn >= parsed.data.arena.radiusIn) return []
    return [colosseum(parsed.data)]
  })
}

function colosseum(source: Source): { deployment: Deployment; layout: TerrainLayout } {
  const depth = source.deploymentDepthIn
  const deploymentId = `deployment-${source.id}`
  return {
    deployment: {
      id: deploymentId,
      name: source.name,
      description: `${depth}″ from each board edge on a ${BOARD_IN}″ square arena.`,
      zones: [
        { player: 'attacker', name: 'Attacker Deployment', colour: '#ef4444', points: rectangle(0, 0, BOARD_IN, depth).map(landscape) },
        {
          player: 'defender',
          name: 'Defender Deployment',
          colour: '#3b82f6',
          points: rectangle(0, BOARD_IN - depth, BOARD_IN, BOARD_IN).map(landscape),
        },
      ],
      attackerTerritory: null,
      objectives: 'objectiveRadiusIn' in source ? [] : gapObjectives(source).map(landscape),
    },
    layout: {
      id: source.id,
      name: source.name,
      description: null,
      matchupId: KOTC_MATCHUP_ID,
      variant: null,
      deploymentId,
      pieces: [],
      geometry: {
        board: { width: BOARD_IN, height: BOARD_IN },
        areas: [...('objectiveRadiusIn' in source ? objectiveAreas(source) : gapWalls(source)), ...pieceAreas(source)],
      },
      publisherObjectiveUrl: source.objectiveDiagram,
      publisherTerrainUrl: source.terrainDiagram,
      publisherUrl: source.publisher,
    },
  }
}

/** The centre objective, then one in each gap, north first and then clockwise. */
function gapObjectives(source: Source): Point[] {
  const inset = 'objectiveInsetIn' in source.arena ? source.arena.objectiveInsetIn : 0
  const middle = BOARD_IN / 2
  return [
    { x: middle, y: middle },
    { x: middle, y: inset },
    { x: BOARD_IN - inset, y: middle },
    { x: middle, y: BOARD_IN - inset },
    { x: inset, y: middle },
  ]
}

/**
 * Each impassable stretch of arena wall between two gaps, as a terrain area the width of the wall. The objectives
 * are markers rather than terrain, so each wall carries the printed placement of the gap objective it starts at,
 * the way 2.0's walls carry theirs.
 */
function gapWalls(source: Source): Area[] {
  if (!('wallArcsDeg' in source.arena)) return []
  const centre = { x: BOARD_IN / 2, y: BOARD_IN / 2 }
  const { radiusIn, wallArcsDeg } = source.arena
  const half = source.wallThicknessIn / 2
  const [, north, east, south, west] = gapObjectives(source) as [Point, Point, Point, Point, Point]
  const exact = (from: Point, to: Point) => ({ from: landscape(from), to: landscape(to) })
  const guides = [
    { direction: -90, measurements: [exact({ x: 18, y: 0 }, north), exact(centre, north), exact({ x: 0, y: north.y }, north)] },
    { direction: 0, measurements: [exact({ x: BOARD_IN, y: 18 }, east), exact(centre, east)] },
    { direction: 90, measurements: [exact({ x: 18, y: BOARD_IN }, south), exact(centre, south)] },
    { direction: 180, measurements: [exact({ x: 0, y: 18 }, west), exact(centre, west), exact({ x: west.x, y: 0 }, west)] },
  ]
  return wallArcsDeg.map(([from, to], index) => {
    const id = `arena-wall-${index + 1}`
    const end = to < from ? to + 360 : to
    const gap = guides.reduce((nearest, guide) =>
      (from - guide.direction + 360) % 360 < (from - nearest.direction + 360) % 360 ? guide : nearest,
    )
    // Each deployment depth is drawn beside the wall that starts at its home objective, where 2.0 draws it too.
    const depth =
      gap.direction === -90
        ? [exact({ x: 8, y: 0 }, { x: 8, y: source.deploymentDepthIn })]
        : gap.direction === 90
          ? [exact({ x: BOARD_IN - 8, y: BOARD_IN }, { x: BOARD_IN - 8, y: BOARD_IN - source.deploymentDepthIn })]
          : []
    return area(id, 'Arena wall', [...arc(centre, radiusIn + half, from, end), ...arc(centre, radiusIn - half, end, from)], {
      objective: null,
      measurements: [...gap.measurements, ...depth],
      parts: [
        {
          id: `${id}-wall`,
          name: 'Impassable arena wall',
          material: 'dense',
          roof: null,
          walls: [{ id: `${id}-wall-1`, points: arc(centre, radiusIn, from, end).map(landscape), thickness: source.wallThicknessIn }],
        },
      ],
    })
  })
}

/** Four objectives sit on the arena walls, outside the arena, and the fifth is the open centre. */
function objectiveAreas(source: WalledSource): Area[] {
  const centre = { x: BOARD_IN / 2, y: BOARD_IN / 2 }
  const { radiusIn, wallHalfAngleDeg } = source.arena
  const range = source.objectiveRadiusIn
  const outer = [
    { id: 'north-home-objective', name: 'North home objective', direction: -90 },
    { id: 'east-expansion-objective', name: 'East expansion objective', direction: 0 },
    { id: 'south-home-objective', name: 'South home objective', direction: 90 },
    { id: 'west-expansion-objective', name: 'West expansion objective', direction: 180 },
  ].map(({ id, name, direction }): Area => {
    const objective = polar(centre, radiusIn, direction)
    // Where the objective's range meets the arena circle, seen from the arena centre.
    const spread = (Math.acos(1 - (range * range) / (2 * radiusIn * radiusIn)) * 180) / Math.PI
    const start = direction + turn(degrees(polar(centre, radiusIn, direction - spread), objective) - direction)
    const end = direction + turn(degrees(polar(centre, radiusIn, direction + spread), objective) - direction)
    const edge = polar(centre, BOARD_IN / 2, direction)
    const measurements = [placement(edge, objective), placement(centre, objective)]
    if (direction === -90) measurements.push(placement({ x: 0, y: objective.y }, objective))
    if (direction === 180) measurements.push(placement({ x: objective.x, y: 0 }, objective))
    if (direction === -90) {
      measurements.push({ from: landscape({ x: 8, y: 0 }), to: landscape({ x: 8, y: source.deploymentDepthIn }) })
    }
    if (direction === 90) {
      measurements.push({
        from: landscape({ x: BOARD_IN - 8, y: BOARD_IN }),
        to: landscape({ x: BOARD_IN - 8, y: BOARD_IN - source.deploymentDepthIn }),
      })
    }
    return area(id, name, [...arc(centre, radiusIn, direction - spread, direction + spread), ...arc(objective, range, end, start)], {
      objective,
      measurements,
      parts: [
        {
          id: `${id}-wall`,
          name: 'Arena wall',
          material: 'dense',
          roof: null,
          walls: [
            {
              id: `${id}-wall-1`,
              points: arc(centre, radiusIn, direction - wallHalfAngleDeg, direction + wallHalfAngleDeg).map(landscape),
              thickness: source.wallThicknessIn,
            },
          ],
        },
      ],
    })
  })
  return [...outer, area('centre-objective', 'Centre objective', arc(centre, range, 0, 360).slice(0, -1), { objective: centre, parts: [] })]
}

function pieceAreas(source: Source): Area[] {
  const half = source.wallThicknessIn / 2
  return source.pieces.flatMap((piece) =>
    piece.mirrors.map((mirror) => {
      const id = `${piece.name.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}-${mirror}`
      const parts = piece.parts.map((part, partIndex) => ({
        ...part,
        id: `${id}-part-${partIndex + 1}`,
        floor: part.floor?.map((entry) => mirrored(entry, mirror)) ?? null,
        walls: part.walls.map((points) => points.map((entry) => mirrored(entry, mirror))),
      }))
      const extent = parts.flatMap((part) => [
        ...(part.floor ?? []),
        ...part.walls.flat().flatMap((entry) => [
          { x: entry.x - half, y: entry.y - half },
          { x: entry.x + half, y: entry.y + half },
        ]),
      ])
      const xs = extent.map((entry) => clamp(entry.x))
      const ys = extent.map((entry) => clamp(entry.y))
      const corner = parts
        .flatMap((part) => part.walls.flat())
        .sort((a, b) => Math.hypot(a.x - BOARD_IN / 2, a.y - BOARD_IN / 2) - Math.hypot(b.x - BOARD_IN / 2, b.y - BOARD_IN / 2))[0]!
      return area(id, piece.name, rectangle(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)), {
        objective: null,
        measurements: [
          placement({ x: corner.x <= BOARD_IN / 2 ? 0 : BOARD_IN, y: corner.y }, corner),
          placement({ x: corner.x, y: corner.y <= BOARD_IN / 2 ? 0 : BOARD_IN }, corner),
        ].filter(({ from, to }) => from.x !== to.x || from.y !== to.y),
        parts: parts.map((part) => ({
          id: part.id,
          name: part.name,
          material: part.material,
          roof: part.floor?.map(landscape) ?? null,
          walls: part.walls.map((points, wallIndex) => ({
            id: `${part.id}-wall-${wallIndex + 1}`,
            points: points.map(landscape),
            thickness: source.wallThicknessIn,
          })),
        })),
      })
    }),
  )
}

function placement(from: Point, to: Point): Area['measurements'][number] {
  return { from: landscape(from), to: landscape(to), approximate: true }
}

function area(
  id: string,
  name: string,
  points: Point[],
  { objective, measurements = [], parts }: { objective: Point | null; measurements?: Area['measurements']; parts: Area['parts'] },
): Area {
  return {
    id,
    name,
    points: points.map(landscape),
    markers: [],
    objective: objective ? { position: landscape(objective), group: null } : null,
    group: null,
    measurements,
    parts,
  }
}

/** Play On prints the board north up; the shared renderer turns landscape boards upright. */
function landscape(entry: Point): Point {
  return { x: round(BOARD_IN - entry.y), y: round(entry.x) }
}

function mirrored(entry: Point, mirror: 'none' | 'x' | 'y' | 'xy'): Point {
  return {
    x: mirror === 'x' || mirror === 'xy' ? BOARD_IN - entry.x : entry.x,
    y: mirror === 'y' || mirror === 'xy' ? BOARD_IN - entry.y : entry.y,
  }
}

function arc(centre: Point, radius: number, from: number, to: number): Point[] {
  const steps = Math.max(2, Math.ceil(Math.abs(to - from) / 3))
  return Array.from({ length: steps + 1 }, (_, index) => polar(centre, radius, from + ((to - from) * index) / steps))
}

function polar(centre: Point, radius: number, angle: number): Point {
  const radians = (angle * Math.PI) / 180
  return { x: centre.x + radius * Math.cos(radians), y: centre.y + radius * Math.sin(radians) }
}

function degrees(entry: Point, from: Point) {
  return (Math.atan2(entry.y - from.y, entry.x - from.x) * 180) / Math.PI
}

/** An angle as the shorter turn either way, in (-180, 180]. */
function turn(angle: number) {
  return angle - 360 * Math.ceil((angle - 180) / 360)
}

function rectangle(left: number, top: number, right: number, bottom: number): Point[] {
  return [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom },
  ]
}

const clamp = (value: number) => Math.min(BOARD_IN, Math.max(0, value))
const round = (value: number) => Math.round(value * 1000) / 1000

/** An image Play On Tabletop published, or the printed mat Frontline Gaming makes with it. */
function publisherImage(value: unknown): value is string {
  const url = typeof value === 'string' ? URL.parse(value) : null
  if (url?.protocol !== 'https:' || !/\.(png|jpg)$/.test(url.pathname)) return false
  return (
    (url.hostname === 'playontabletop.com' && url.pathname.startsWith('/wp-content/uploads/')) ||
    (url.hostname === 'cdn.shopify.com' && url.pathname.startsWith('/s/files/1/0491/7225/0789/files/'))
  )
}

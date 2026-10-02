import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { KOTC_MATCHUP_ID, type Deployment, type Point, type TerrainGeometry, type TerrainLayout } from '../contracts/terrain'

const BOARD_IN = 36
const point = z.object({ x: z.number().min(0).max(BOARD_IN), y: z.number().min(0).max(BOARD_IN) })
const wall = z.array(point).min(2).max(12)
const sourceSchema = z.object({
  format: z.literal('praetorium.kotc.v1'),
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().trim().min(1),
  publisher: z.literal('https://playontabletop.com/kotc/'),
  boardIn: z.literal(BOARD_IN),
  deploymentDepthIn: z.literal(8),
  objectiveDiagram: z.string().refine(publisherImage),
  terrainDiagram: z.string().refine(publisherImage),
  wallThicknessIn: z.number().positive().max(2),
  arena: z.object({ radiusIn: z.number().positive().max(16), wallHalfAngleDeg: z.number().positive().max(45) }),
  objectiveRadiusIn: z.number().positive().max(6),
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
type Source = z.infer<typeof sourceSchema>
type Area = TerrainGeometry['areas'][number]

/**
 * The Colosseum as Play On Tabletop prints it, north at the top, turned into the
 * landscape board frame every other layout uses.
 *
 * The publisher prints only the board size and deployment depth; the arena radius,
 * objective range and piece outlines are traced from its diagrams, so the layout says so.
 */
export function kotcTerrain(directory: string): { deployment: Deployment; layout: TerrainLayout } | null {
  const file = path.join(directory, 'kotc.json')
  if (!fs.existsSync(file)) return null
  const parsed = sourceSchema.safeParse(JSON.parse(fs.readFileSync(file, 'utf8')))
  if (!parsed.success || parsed.data.objectiveRadiusIn >= parsed.data.arena.radiusIn) return null
  const source = parsed.data
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
      objectives: [],
    },
    layout: {
      id: source.id,
      name: source.name,
      description: null,
      matchupId: KOTC_MATCHUP_ID,
      variant: null,
      deploymentId,
      pieces: [],
      geometry: { board: { width: BOARD_IN, height: BOARD_IN }, areas: [...objectiveAreas(source), ...pieceAreas(source)] },
      publisherObjectiveUrl: source.objectiveDiagram,
      publisherTerrainUrl: source.terrainDiagram,
      publisherUrl: source.publisher,
    },
  }
}

/** Four objectives sit on the arena walls, outside the arena, and the fifth is the open centre. */
function objectiveAreas(source: Source): Area[] {
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
    return area(id, name, [...arc(centre, radiusIn, direction - spread, direction + spread), ...arc(objective, range, end, start)], {
      objective,
      measurements:
        direction === -90
          ? [{ from: landscape({ x: 8, y: 0 }), to: landscape({ x: 8, y: source.deploymentDepthIn }) }]
          : direction === 90
            ? [
                {
                  from: landscape({ x: BOARD_IN - 8, y: BOARD_IN }),
                  to: landscape({ x: BOARD_IN - 8, y: BOARD_IN - source.deploymentDepthIn }),
                },
              ]
            : [],
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
      return area(id, piece.name, rectangle(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)), {
        objective: null,
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
    objectiveGroup: null,
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

function publisherImage(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      url.hostname === 'playontabletop.com' &&
      url.pathname.startsWith('/wp-content/uploads/') &&
      url.pathname.endsWith('.png')
    )
  } catch {
    return false
  }
}

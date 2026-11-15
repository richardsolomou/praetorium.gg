import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { KOTC_MATCHUP_ID } from '../contracts/terrain'
import { kotcTerrain } from './kotcTerrain'

let directory: string | null = null
afterEach(() => {
  if (directory) fs.rmSync(directory, { recursive: true, force: true })
  directory = null
})

const source = () => ({
  format: 'praetorium.kotc.v1',
  id: 'kotc-2',
  name: 'King of the Colosseum 2.0',
  publisher: 'https://playontabletop.com/kotc/',
  boardIn: 36,
  deploymentDepthIn: 8,
  objectiveDiagram: 'https://playontabletop.com/wp-content/uploads/2026/09/frontline-objectives.png',
  terrainDiagram: 'https://playontabletop.com/wp-content/uploads/2026/09/frontline-terrain.png',
  wallThicknessIn: 0.5,
  arena: { radiusIn: 13, wallHalfAngleDeg: 31.4 },
  objectiveRadiusIn: 3.79,
  pieces: [
    {
      name: 'Inner ruin',
      mirrors: ['none', 'x', 'y', 'xy'],
      parts: [
        {
          name: 'Ruin',
          material: 'dense',
          floor: [
            { x: 10, y: 12 },
            { x: 14.5, y: 12 },
            { x: 14.5, y: 14.5 },
            { x: 10, y: 14.5 },
          ],
          walls: [
            [
              { x: 14.75, y: 12 },
              { x: 14.75, y: 14.75 },
              { x: 10.25, y: 14.75 },
            ],
          ],
        },
        {
          name: 'Low wall',
          material: 'light',
          walls: [
            [
              { x: 14.75, y: 10.25 },
              { x: 14.75, y: 12 },
            ],
          ],
        },
      ],
    },
  ],
})

const loadAll = (files: Record<string, Record<string, unknown>>) => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-kotc-'))
  for (const [name, value] of Object.entries(files)) fs.writeFileSync(path.join(directory, name), JSON.stringify(value))
  return kotcTerrain(directory)
}
const load = (value: Record<string, unknown>) => loadAll({ 'kotc.json': value })[0] ?? null
const first = () => ({
  ...source(),
  id: 'kotc-1',
  name: 'King of the Colosseum 1.0',
  deploymentDepthIn: 9,
  objectiveRadiusIn: undefined,
  arena: {
    radiusIn: 13,
    wallArcsDeg: [
      [281, 346],
      [14, 81],
      [101, 167],
      [195, 259],
    ],
    objectiveInsetIn: 6,
  },
})
const inside = (point: { x: number; y: number }, zone: { x: number; y: number }[]) =>
  point.x >= Math.min(...zone.map((entry) => entry.x)) &&
  point.x <= Math.max(...zone.map((entry) => entry.x)) &&
  point.y >= Math.min(...zone.map((entry) => entry.y)) &&
  point.y <= Math.max(...zone.map((entry) => entry.y))
const zone = (player: string) => load(source())!.deployment.zones.find((entry) => entry.player === player)!.points
const objectives = () =>
  load(source())!.layout.geometry!.areas.flatMap((area) => (area.objective ? [{ name: area.name, ...area.objective.position }] : []))

it('draws the Colosseum on a 36-inch square board for the Colosseum matchup', () => {
  expect(load(source())?.layout).toMatchObject({ matchupId: KOTC_MATCHUP_ID, geometry: { board: { width: 36, height: 36 } } })
})

it('gives the attacker the printed 8-inch strip along the north edge', () => {
  // The landscape frame's far x edge is the north edge once the board is drawn upright.
  expect(zone('attacker')).toEqual([
    { x: 36, y: 0 },
    { x: 36, y: 36 },
    { x: 28, y: 36 },
    { x: 28, y: 0 },
  ])
})

it('marks both printed deployment depths on clear parts of the board', () => {
  const measurements = load(source())!
    .layout.geometry!.areas.flatMap((area) => area.measurements)
    .filter((measurement) => !measurement.approximate)
  expect(measurements).toEqual([
    { from: { x: 36, y: 8 }, to: { x: 28, y: 8 } },
    { from: { x: 0, y: 28 }, to: { x: 8, y: 28 } },
  ])
})

it('places each home objective in its own deployment zone', () => {
  const homes = objectives().filter((objective) => objective.name.includes('home'))
  expect(homes.map((home) => [inside(home, zone('attacker')), inside(home, zone('defender'))])).toEqual([
    [true, false],
    [false, true],
  ])
})

it('places the expansion objectives and the centre objective outside both deployment zones', () => {
  const neutral = objectives().filter((objective) => !objective.name.includes('home'))
  expect(neutral.filter((objective) => inside(objective, zone('attacker')) || inside(objective, zone('defender')))).toEqual([])
})

it('puts each outer objective on its arena wall', () => {
  const outer = load(source())!.layout.geometry!.areas.filter((area) => area.objective && area.parts.length)
  expect(outer.map((area) => area.parts.map((part) => part.name))).toEqual([['Arena wall'], ['Arena wall'], ['Arena wall'], ['Arena wall']])
})

it('mirrors a piece into every listed quarter of the board', () => {
  const ruins = load(source())!.layout.geometry!.areas.filter((area) => area.name === 'Inner ruin')
  expect(new Set(ruins.map((ruin) => JSON.stringify(ruin.parts[0]!.roof))).size).toBe(4)
})

it('frames a piece in the extent of its walls and floor', () => {
  const ruin = load(source())!.layout.geometry!.areas.find((area) => area.id === 'inner-ruin-none')!
  expect(ruin.points).toEqual([
    { x: 26, y: 10 },
    { x: 26, y: 15 },
    { x: 21, y: 15 },
    { x: 21, y: 10 },
  ])
})

it('locates each mirrored ruin by the real wall corner nearest the arena centre', () => {
  const ruins = load(source())!.layout.geometry!.areas.filter((area) => area.name === 'Inner ruin')
  expect(ruins.map((ruin) => ruin.measurements)).toEqual([
    [
      { from: { x: 21.25, y: 0 }, to: { x: 21.25, y: 14.75 }, approximate: true },
      { from: { x: 36, y: 14.75 }, to: { x: 21.25, y: 14.75 }, approximate: true },
    ],
    [
      { from: { x: 21.25, y: 36 }, to: { x: 21.25, y: 21.25 }, approximate: true },
      { from: { x: 36, y: 21.25 }, to: { x: 21.25, y: 21.25 }, approximate: true },
    ],
    [
      { from: { x: 14.75, y: 0 }, to: { x: 14.75, y: 14.75 }, approximate: true },
      { from: { x: 0, y: 14.75 }, to: { x: 14.75, y: 14.75 }, approximate: true },
    ],
    [
      { from: { x: 14.75, y: 36 }, to: { x: 14.75, y: 21.25 }, approximate: true },
      { from: { x: 0, y: 21.25 }, to: { x: 14.75, y: 21.25 }, approximate: true },
    ],
  ])
})

it('derives objective offsets and arena radii from the fetched geometry', () => {
  const geometry = load({ ...source(), arena: { radiusIn: 12, wallHalfAngleDeg: 31.4 } })!.layout.geometry!
  const outer = geometry.areas.filter((area) => area.objective && area.parts.length)
  const centre = geometry.areas.find((area) => area.id === 'centre-objective')!.objective!.position
  expect(
    outer.map((area) =>
      area.measurements
        .filter((measurement) => measurement.approximate)
        .map(({ from, to }) => ({
          length: Math.hypot(to.x - from.x, to.y - from.y),
          fromCentre: from.x === centre.x && from.y === centre.y,
          toObjective: to.x === area.objective!.position.x && to.y === area.objective!.position.y,
        })),
    ),
  ).toEqual([
    [
      { length: 6, fromCentre: false, toObjective: true },
      { length: 12, fromCentre: true, toObjective: true },
      { length: 18, fromCentre: false, toObjective: true },
    ],
    [
      { length: 6, fromCentre: false, toObjective: true },
      { length: 12, fromCentre: true, toObjective: true },
    ],
    [
      { length: 6, fromCentre: false, toObjective: true },
      { length: 12, fromCentre: true, toObjective: true },
    ],
    [
      { length: 6, fromCentre: false, toObjective: true },
      { length: 12, fromCentre: true, toObjective: true },
      { length: 18, fromCentre: false, toObjective: true },
    ],
  ])
})

it('does not draw a zero-length guide for a wall that touches a board edge', () => {
  const changed = source()
  changed.pieces = [
    {
      ...changed.pieces[0]!,
      mirrors: ['none'],
      parts: [
        {
          name: 'Wall',
          material: 'dense',
          walls: [
            [
              { x: 0, y: 5 },
              { x: 0, y: 8 },
            ],
          ],
        },
      ],
    },
  ]
  expect(load(changed)!.layout.geometry!.areas.find((area) => area.name === 'Inner ruin')!.measurements).toEqual([
    { from: { x: 36, y: 0 }, to: { x: 28, y: 0 }, approximate: true },
  ])
})

it('rejects an untrusted diagram source', () => {
  expect(load({ ...source(), objectiveDiagram: 'https://other.example/diagram.png' })).toBeNull()
})

it('rejects a piece beyond the board', () => {
  const changed = source()
  changed.pieces[0]!.parts[0]!.walls[0]![0]!.x = 37
  expect(load(changed)).toBeNull()
})

it('rejects an objective range that reaches the arena centre', () => {
  expect(load({ ...source(), objectiveRadiusIn: 13 })).toBeNull()
})

it('reads the current Colosseum before the one it replaced', () => {
  expect(loadAll({ 'kotc-1.json': first(), 'kotc.json': source() }).map(({ layout }) => layout.name)).toEqual([
    'King of the Colosseum 2.0',
    'King of the Colosseum 1.0',
  ])
})

it('puts the first Colosseum’s outer objectives in the gaps between its walls', () => {
  const [colosseum] = loadAll({ 'kotc-1.json': first() })
  const walls = colosseum!.layout.geometry!.areas.filter((area) => area.name === 'Arena wall')
  const inPolygon = (point: { x: number; y: number }, polygon: { x: number; y: number }[]) =>
    polygon.reduce((crossed, a, index) => {
      const b = polygon[(index + 1) % polygon.length]!
      return a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x ? !crossed : crossed
    }, false)
  // Where the line from the centre through each outer objective meets the wall circle.
  const onCircle = colosseum!.deployment.objectives.flatMap((objective) => {
    const distance = Math.hypot(objective.x - 18, objective.y - 18)
    return distance ? [{ x: 18 + ((objective.x - 18) * 13) / distance, y: 18 + ((objective.y - 18) * 13) / distance }] : []
  })
  expect({
    gaps: onCircle.length,
    blocked: onCircle.filter((point) => walls.some((wall) => inPolygon(point, wall.points))),
  }).toEqual({ gaps: 4, blocked: [] })
})

it('measures each of the first Colosseum’s gap objectives from its edge and the centre', () => {
  const [colosseum] = loadAll({ 'kotc-1.json': first() })
  const [, ...outer] = colosseum!.deployment.objectives
  const reaching = (objective: { x: number; y: number }) =>
    colosseum!.layout
      .geometry!.areas.flatMap((area) => area.measurements)
      .filter(({ to, approximate }) => !approximate && to.x === objective.x && to.y === objective.y)
      .map(({ from, to }) => Math.round(Math.hypot(to.x - from.x, to.y - from.y)))
      .sort((a, b) => a - b)
  expect(outer.map(reaching)).toEqual([
    [6, 12, 18],
    [6, 12],
    [6, 12],
    [6, 12, 18],
  ])
})

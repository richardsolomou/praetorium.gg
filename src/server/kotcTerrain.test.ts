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

const load = (value: Record<string, unknown>) => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-kotc-'))
  fs.writeFileSync(path.join(directory, 'kotc.json'), JSON.stringify(value))
  return kotcTerrain(directory)
}
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
  const measurements = load(source())!.layout.geometry!.areas.flatMap((area) => area.measurements)
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
